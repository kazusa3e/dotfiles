{
  pkgs ? import <nixpkgs> { },
  unstablePkgs ? import <unstable> { },
}:

pkgs.mkShell {
  packages =
    (with pkgs; [
      bash
      nodejs
      git
      ripgrep
      fd
      # lynx
      sudo
      shadow
      cacert
      vim
      clang
      cmake
      gnumake
      rust-analyzer
      gopls
      ty
      bash-language-server
    ])
    ++ [
      unstablePkgs.pi-coding-agent
    ];
}
