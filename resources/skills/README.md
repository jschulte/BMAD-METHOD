# BMAD Skills for Claude Desktop

This directory contains standalone skills for Claude Desktop that extend BMAD functionality.

## Available Skills

| Skill | File | Purpose |
|-------|------|---------|
| BMAD Guide | `bmad-guide.md` | Process navigation & workflow selection |
| Collect PRD Feedback | `collect-prd-feedback.md` | Gather stakeholder feedback on PRDs/Epics |

---

## BMAD Guide Skill

The **BMAD Guide Skill** is a comprehensive reference that helps Claude stay on track with BMAD methodology.

### Automatic Installation

When you run `npx bmad-method install` and select Claude Code as your IDE, this skill is **automatically installed** to `~/.claude/skills/bmad-guide.md`.

This means Claude will have access to the `/bmad-guide` skill in any project, helping it:
- Navigate BMAD phases correctly
- Choose the right workflow for each task
- Avoid common mistakes (jumping to coding, skipping phases, etc.)
- Follow proper story lifecycle
- Self-correct when going off track

### What the Skill Does

The bmad-guide skill acts as Claude's "GPS" for BMAD methodology:

#### 📍 Phase Navigation
Quick reference for identifying current phase and what workflows are available

#### 🎯 Project Level Detection
Helps determine project complexity (Level 0-4) to route to correct planning track

#### 🔍 Workflow Decision Tree
Visual guide for choosing which workflow to use for any given task

#### ⚠️ Common Mistakes Prevention
Clear DO/DON'T lists to avoid derailment from BMAD process

#### 📚 Quick Reference
"I need to..." → workflow mapping table for fast lookup

#### 💡 Troubleshooting
Solutions for common issues like "I'm not sure which phase I'm in"

#### 🚨 Emergency Recovery
Course correction steps when Claude has gone off track

### Manual Installation

```bash
mkdir -p ~/.claude/skills
cp resources/skills/bmad-guide.md ~/.claude/skills/
```

---

## Collect PRD Feedback Skill

The **Collect PRD Feedback Skill** enables zero-setup stakeholder feedback collection. Perfect for gathering input from people who don't have BMAD installed.

### Use Case

You have a PRD or Epic published as a GitHub Issue and want stakeholders to provide structured feedback without needing to understand BMAD, install anything, or learn new tools.

### How It Works

1. **Stakeholder** has Claude Desktop (free requirement)
2. **You** send them a one-line "bootstrap prompt"
3. **Claude** installs the skill, loads the PRD, and conducts a conversational feedback session
4. **Stakeholder** reviews synthesized feedback and posts it as a GitHub comment

### The Bootstrap Prompt

Send this to stakeholders (customize the URL):

```
Please help me provide feedback on a PRD:

1. Fetch the feedback skill from:
   https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/resources/skills/collect-prd-feedback.md
2. Save it to ~/.claude/skills/collect-prd-feedback.md
3. Then run: /collect-prd-feedback OWNER/REPO#ISSUE_NUMBER
```

**Example for a specific PRD:**

```
Please help me provide feedback on a PRD:

1. Fetch the feedback skill from:
   https://raw.githubusercontent.com/acme/product-specs/main/resources/skills/collect-prd-feedback.md
2. Save it to ~/.claude/skills/collect-prd-feedback.md
3. Then run: /collect-prd-feedback acme/product-specs#47
```

### Simplified Bootstrap (After First Install)

Once a stakeholder has installed the skill, future requests are simpler:

```
Please run: /collect-prd-feedback acme/product-specs#52
```

### What Stakeholders Experience

1. **Paste the prompt** → Claude installs the skill automatically
2. **Claude loads the PRD** from GitHub and presents a summary
3. **Natural conversation** - Claude asks probing questions to understand their perspective
4. **Mode options** - They can say "let me dump" to just talk freely
5. **Synthesis** - Claude structures their feedback by type (concerns, suggestions, etc.)
6. **Review** - They verify Claude captured their intent correctly
7. **Submit** - Post directly to GitHub or copy/paste the formatted comment

### Feedback Types Captured

| Type | Emoji | Description |
|------|-------|-------------|
| Concern | ⚠️ | Risks or problems with current approach |
| Suggestion | 💡 | Alternative approaches or improvements |
| Addition | ➕ | Missing items that should be included |
| Clarification | 🤔 | Questions needing answers |
| Priority | 🎯 | What's most/least important |
| Blocker | 🛑 | Must-fix before approval |

### Manual Installation

```bash
mkdir -p ~/.claude/skills
cp resources/skills/collect-prd-feedback.md ~/.claude/skills/
```

Or fetch directly:

```bash
curl -o ~/.claude/skills/collect-prd-feedback.md \
  https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/resources/skills/collect-prd-feedback.md
```

### Requirements

- **Stakeholder needs:** Claude Desktop (free)
- **For direct GitHub posting:** MCP GitHub server configured (optional - can copy/paste instead)
- **For private repos:** Stakeholder needs repo access

---

## Creating Custom Skills

Skills are markdown files that teach Claude how to perform specific tasks. Place them in `~/.claude/skills/` to make them available via `/skill-name`.

### Skill File Structure

```markdown
# Skill Name

Brief description of what this skill does.

## Usage

/skill-name [arguments]

## Instructions

When this skill is invoked:

1. [First step]
2. [Second step]
3. ...

[Detailed instructions for Claude to follow]
```

### Tips for Effective Skills

1. **Be explicit** - Claude follows instructions literally
2. **Include examples** - Show expected inputs and outputs
3. **Handle edge cases** - What if the input is malformed?
4. **Provide fallbacks** - What if a tool isn't available?
5. **Keep it focused** - One skill, one purpose

---

## Installation Location

Skills are installed to `~/.claude/skills/` (user level) so they're available across all projects.

## Updating Skills

Re-run `npx bmad-method install` or manually copy updated files to `~/.claude/skills/`.
