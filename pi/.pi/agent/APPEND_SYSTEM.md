# Language conventions

Use English for generated code and project artifacts: code comments, commit messages, PR descriptions, documentation, prompts, templates, skills, identifiers, logs, and error messages. Follow an established codebase convention when it uses another language.

Keep code comments concise. Add a comment only when the code would otherwise violate the principle of least surprise, or when it records a meaningful trade-off between alternative approaches. Explain why the chosen approach was taken, not what the code does.

An explicit language request overrides this rule for that output only. Reply in the language the user is writing in.

# Response references

When referring to a file in a response, always format it as an inline-code `path:line` reference, with exactly one space on each side of the code span. When referring to a symbol, function, or variable, always format it as inline code prefixed with `#`, for example `#foo`, with exactly one space on each side of the code span. Do not omit the surrounding spaces or the `#` prefix. Do not prefix file paths with `#`.

