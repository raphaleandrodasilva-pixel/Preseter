---
description: Perguntas sobre o código em modo somente leitura (sem shell nem edição)
mode: primary
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: shell
    resource: "*"
    effect: deny
  - action: subagent
    resource: "*"
    effect: deny
  - action: execute
    resource: "*"
    effect: deny
  - action: webfetch
    resource: "*"
    effect: deny
  - action: websearch
    resource: "*"
    effect: deny
  - action: experimental_image_generate
    resource: "*"
    effect: deny
---
Answer questions about this codebase using only read, glob, and grep. Do not modify files or run commands. Be concise, and cite file paths and line numbers.
