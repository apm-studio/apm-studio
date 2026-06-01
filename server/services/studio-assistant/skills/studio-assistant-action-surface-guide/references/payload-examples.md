# Payload Examples

## Create Agent

```json
{"version":1,"actions":[{"type":"createAgent","ref":"coder","name":"Coder","description":"Writes code carefully and keeps implementation changes scoped."}]}
```

## Create Agent With Skill

```json
{"version":1,"actions":[{"type":"createAgent","ref":"researcher","name":"Researcher","description":"Researches carefully, tracks uncertainty, and hands off sourced findings.","addSkillDrafts":[{"name":"Source Validation","content":"# Source Validation\n\nUse this skill to validate sources."}]}]}
```

## Create Connected Team

```json
{"version":1,"actions":[{"type":"createAgent","ref":"dev","name":"Developer"},{"type":"createAgent","ref":"rev","name":"Reviewer"},{"type":"createTeam","name":"Code Review","participantAgentRefs":["dev","rev"],"relations":[{"sourceAgentRef":"dev","targetAgentRef":"rev","direction":"one-way","name":"request review","description":"Developer sends work to Reviewer for review."}]}]}
```

## Update Relation

```json
{"version":1,"actions":[{"type":"updateRelation","teamName":"Code Review","relationId":"rel-abc123","name":"request review","description":"Developer sends work to Reviewer for review.","direction":"one-way"}]}
```

## Set Team Rules And Subscriptions

```json
{"version":1,"actions":[{"type":"updateTeam","teamName":"Code Review","teamRules":["Escalate blockers quickly.","Keep review comments actionable."]},{"type":"updateParticipantSubscriptions","teamName":"Code Review","agentName":"Reviewer","subscriptions":{"messagesFromAgentNames":["Developer"],"messageTags":["review-request"],"callboardKeys":["review-summary"],"eventTypes":["runtime.idle"]}}]}
```

## Create Skill Bundle

```json
{"version":1,"actions":[{"type":"createSkillDraft","ref":"skill","name":"Review Skill","content":"---\nname: review-skill\ndescription: Review workflow helpers.\n---\n\n# Review Skill\n\nUse this skill when you need a review workflow."},{"type":"upsertSkillBundleFile","draftRef":"skill","path":"references/checklist.md","content":"# Checklist\n\n- Verify scope\n- Leave actionable feedback"},{"type":"upsertSkillBundleFile","draftRef":"skill","path":"agents/openai.yaml","content":"display_name: Review Skill\nshort_description: Review workflow helpers\ndefault_prompt: Use this skill when review structure matters."}]}
```

## UI Operation

```json
{"version":1,"actions":[{"type":"showAgent","agentName":"Researcher","surface":"editor"},{"type":"setStudioPanel","panel":"packages","open":true}]}
```
