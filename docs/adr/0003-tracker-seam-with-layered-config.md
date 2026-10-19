---
status: accepted
---

# One tracker seam, layered dotenv config

Every tracker operation (create, get, comment, start, close, publish) goes through the `track-it` skill, backed by local files by default and by GitHub (`gh`) or Jira (REST v2) when configured. Configuration is dotenv files layered user, project, project-local, then environment, so a team commits its tracker choice and each developer keeps tokens out of the repo.

## Considered options

- **Port the Jira connector bridge.** It worked by echoing `CONNECTOR: ...` lines from bash for the agent to translate, and carried Jira-only assumptions into every skill. Replaced by a zero-dependency Node CLI with one adapter per tracker. When a Jira or GitHub MCP tool is present, the agent uses it for the same operation instead of the CLI.
- **YAML or JSON config.** Dotenv was chosen because the same file works as an environment file, needs no parser dependency, and matches the existing `JIRA_*` variable names.
- **Jira REST v3 (ADF bodies).** v2 with wiki markup works on Data Center and Cloud alike, which a v3-only client would not.
