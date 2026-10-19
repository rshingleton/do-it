# Explore instead of build

When the request asks to understand or examine rather than change, hand it to
the matching skill and stop routing. No lane, no work item.

| The user wants to | Hand to |
|-------------------|---------|
| Understand a codebase or an area, onboard, get a map | Call the Skill tool with "map-it" |
| Find bugs, risks, test gaps, debt or drift in existing code | Call the Skill tool with "sweep-it" |
| Get facts about a library, API, standard or tool | Call the Skill tool with "look-it-up" |
| Stress-test an idea or plan without building | Call the Skill tool with "grill-it" |
| Find structural improvements (shallow modules, leaky seams) | Read [deepen-it](../deepen-it/SKILL.md) and follow it (user-invoked, so not loadable as a skill) |

Each of these ends by offering to file what it found with `log-it`. A filed
issue comes back through `/do-it <ref>` as normal work.

A request that mixes both ("look at auth and fix whatever is broken"): explore
first, show the findings, and let the user pick which to build.
