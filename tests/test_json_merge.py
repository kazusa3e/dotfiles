import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts/json-merge.py"
SPEC = importlib.util.spec_from_file_location("json_merge", SCRIPT)
config = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(config)


class JsonMergeTests(unittest.TestCase):
    def test_merge_preserves_runtime_fields(self):
        local = {"defaultModel": "local", "ui": {"theme": "old", "runtime": True}}
        result = config.merge(local, {"ui": {"theme": "new"}})
        self.assertEqual(result, {"defaultModel": "local", "ui": {"theme": "new", "runtime": True}})

    def test_merge_does_not_modify_input(self):
        local = {"ui": {"theme": "old"}}
        config.merge(local, {"ui": {"theme": "new"}})
        self.assertEqual(local, {"ui": {"theme": "old"}})

    def test_arrays_are_replaced(self):
        self.assertEqual(config.merge({"packages": ["old"]}, {"packages": ["new"]}),
                         {"packages": ["new"]})

    def test_comments_and_trailing_commas_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "source.json"
            target = root / "local.jsonc"
            source.write_text('{}')
            for text in ('{ // comment\n"x": 1}', '{"x": 1,}', '{"x": [1,]}'):
                with self.subTest(text=text):
                    target.write_text(text)
                    with self.assertRaises(json.JSONDecodeError):
                        config.apply(source, target)
                    self.assertEqual(target.read_text(), text)

    def test_atomic_update_and_idempotence(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "source.json"
            target = root / "local.json"
            source.write_text('{"theme": "new"}')
            target.write_text('{"theme": "old", "defaultModel": "keep"}')
            target.chmod(0o600)
            self.assertTrue(config.apply(source, target))
            self.assertEqual(json.loads(target.read_text()), {"theme": "new", "defaultModel": "keep"})
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            before = target.stat().st_mtime_ns
            self.assertFalse(config.apply(source, target))
            self.assertEqual(target.stat().st_mtime_ns, before)

    def test_new_config(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "source.json"
            target = root / "subdir/local.json"
            source.write_text('{"theme": "new"}')
            self.assertTrue(config.apply(source, target))
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_symlink_is_not_followed(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "source.json"
            link = root / "local.json"
            source.write_text('{}')
            link.symlink_to(source)
            with self.assertRaises(ValueError):
                config.apply(source, link)
            self.assertEqual(source.read_text(), '{}')

    def test_merge_accepts_symlinked_parent(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            directory = root / "source-directory"
            directory.mkdir()
            link = root / "linked-directory"
            link.symlink_to(directory, target_is_directory=True)
            source = root / "source.json"
            source.write_text('{"theme": "new"}')
            target = link / "settings.json"
            target.write_text('{"defaultModel": "keep"}')
            self.assertTrue(config.apply(source, target))
            self.assertEqual(json.loads((directory / "settings.json").read_text()),
                             {"defaultModel": "keep", "theme": "new"})

    @unittest.skipUnless(all(shutil.which(tool) for tool in ("stow", "make", "git")),
                         "stow, make and git are required")
    def test_stow_merge_and_git_ignore(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            home, repo = root / "home", root / "repo"
            home.mkdir()
            files = (
                "Makefile", "scripts/json-merge.py",
                "pi/settings.base.json", "pi/.stow-local-ignore",
                "pi/.pi/agent/.gitignore", "pi/.pi/agent/keybindings.json",
                "opencode/cli.base.json", "opencode/opencode.base.json",
                "opencode/.stow-local-ignore", "opencode/.config/opencode/.gitignore",
                "opencode/.config/opencode/plugins/bell-notify/tui.ts",
            )
            for relative in files:
                destination = repo / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(REPO / relative, destination)

            def run(*args):
                return subprocess.run(args, cwd=repo, text=True, capture_output=True, check=True).stdout

            run("git", "init", "-q")
            run("git", "add", ".")
            before = run("git", "status", "--porcelain")
            run("stow", "-t", str(home), "pi", "opencode")
            self.assertTrue((home / ".pi").is_symlink())
            self.assertFalse((home / ".local").exists())
            for name in ("settings.base.json", "opencode.base.json", "cli.base.json"):
                self.assertFalse((home / name).exists())
            settings = home / ".pi/agent/settings.json"
            settings.write_text('{"defaultModel": "local-only"}')
            for _ in range(2):
                run("make", "agent-config", f"HOME={home}")
                run("stow", "-t", str(home), "pi", "opencode")
            self.assertEqual(json.loads(settings.read_text())["defaultModel"], "local-only")
            self.assertFalse(settings.is_symlink())
            self.assertEqual(json.loads(settings.read_text())["theme"],
                             json.loads((repo / "pi/settings.base.json").read_text())["theme"])
            for directory in (".pi/agent", ".config/opencode"):
                (home / directory / "skills").symlink_to(root / "worktree", target_is_directory=True)
            ignored = ("pi/.pi/agent/settings.json", "pi/.pi/agent/skills",
                       "opencode/.config/opencode/opencode.jsonc", "opencode/.config/opencode/cli.json",
                       "opencode/.config/opencode/skills")
            self.assertEqual(set(run("git", "check-ignore", *ignored).splitlines()), set(ignored))
            self.assertEqual(run("git", "status", "--porcelain"), before)

    def test_source_contains_no_pi_runtime_state(self):
        source = json.loads((REPO / "pi/settings.base.json").read_text())
        runtime = {"enabledModels", "defaultModel", "defaultProvider", "lastChangelogVersion",
                   "extensionChangelogVersions", "skills"}
        self.assertFalse(runtime.intersection(source))

    def test_null_is_a_value_not_a_deletion(self):
        self.assertEqual(config.merge({"key": "old"}, {"key": None}), {"key": None})

    def test_non_object_inputs_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.json"
            target = Path(root) / "target.json"
            for left, right in (('[]', '{}'), ('{}', '[]')):
                source.write_text(left)
                target.write_text(right)
                with self.assertRaises(ValueError):
                    config.apply(source, target)
                self.assertEqual(target.read_text(), right)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.json"
            target = Path(root) / "target.json"
            source.write_text('{"theme": "new"}')
            for expected in ("updated", "unchanged"):
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), str(source), str(target)],
                    text=True, capture_output=True, check=True,
                )
                self.assertTrue(result.stdout.startswith(expected))
            self.assertEqual(source.read_text(), '{"theme": "new"}')

    def test_invalid_config_does_not_change_file(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "source.json"
            target = root / "local.json"
            source.write_text('{}')
            target.write_text('{ invalid')
            with self.assertRaises(ValueError):
                config.apply(source, target)
            self.assertEqual(target.read_text(), '{ invalid')


if __name__ == "__main__":
    unittest.main()
