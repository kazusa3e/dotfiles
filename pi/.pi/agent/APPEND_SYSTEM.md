# Language conventions

Use English for generated code and project artifacts: code comments, commit messages, PR descriptions, documentation, prompts, templates, skills, identifiers, logs, and error messages. Follow an established codebase convention when it uses another language.

Keep code comments concise. Add a comment only when the code would otherwise violate the principle of least surprise, or when it records a meaningful trade-off between alternative approaches. Explain why the chosen approach was taken, not what the code does.

An explicit language request overrides this rule for that output only. Reply in the language the user is writing in.

# Response references

When referring to a file, symbol, function, or variable in a response, format the reference as inline code and leave one space on each side of it whenever syntactically possible, so it does not run into surrounding words. Prefix every symbol, function, and variable reference with `#` inside the code span; for example, `#foo`. Do not prefix file paths with `#`.

