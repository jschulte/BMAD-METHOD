# Collect PRD Feedback - Standalone Skill

A conversational skill for gathering stakeholder feedback on PRDs and Epics from GitHub.

## Usage

```
/collect-prd-feedback <github-issue-url-or-reference>
```

**Examples:**
- `/collect-prd-feedback https://github.com/acme/product/issues/47`
- `/collect-prd-feedback acme/product#47`
- `/collect-prd-feedback #47` (if in a project with GitHub configured)

---

## Instructions

When this skill is invoked with a GitHub issue reference:

### Phase 1: Load the Document

1. **Parse the reference** to extract owner, repo, and issue number:
   - Full URL: `https://github.com/{owner}/{repo}/issues/{number}`
   - Short form: `{owner}/{repo}#{number}`
   - Local form: `#{number}` (requires MCP GitHub to determine repo)

2. **Fetch the issue content**:
   - First, try using `mcp__github__issue_read` if MCP GitHub is available
   - Fallback: Use `WebFetch` to get `https://github.com/{owner}/{repo}/issues/{number}`
   - Extract the issue title and body (the PRD/Epic content)

3. **If the fetch fails**:
   - Inform the user: "I couldn't access that issue. Is it in a private repo?"
   - Offer alternatives:
     - "You can paste the PRD content directly here"
     - "Or share a public link"

4. **Analyze the document** to understand:
   - Document type (PRD, Epic, RFC, etc.)
   - Key themes and sections
   - User stories or requirements mentioned
   - Open questions or TBD items
   - Constraints and dependencies

### Phase 2: Build Shared Understanding

Present a brief summary to demonstrate understanding:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 [Document Title]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Key Themes:**
• [Theme 1]
• [Theme 2]
• [Theme 3]

**Main Sections:**
• [Section 1]
• [Section 2]
• ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then explain the feedback modes:

> I've reviewed this document and I'm ready to hear your thoughts.
>
> **How this works:**
> I'll ask questions to help draw out your feedback and make sure I fully
> understand your perspective. If you'd rather just tell me everything
> directly, say **"let me dump"** and I'll switch to listening mode.
>
> **When we're done**, I'll synthesize your feedback into a structured
> format you can post as a comment on the issue.

### Phase 3: Conversational Elicitation

Open with genuine curiosity:

> So - what brings you here today? Do you have specific feedback on this
> document, or would you like to start by asking questions about what's
> proposed?

**Elicitation Loop:**

Continue the conversation, using these patterns based on what the stakeholder says:

#### If they ask questions:
Answer based on the document content, then circle back:
> "Does that help clarify things? Based on that, do you have any concerns or thoughts?"

#### If their point is vague:
Probe gently:
> "Can you tell me more about what you mean by [topic]?"
> "What specifically about [topic] concerns you?"
> "Can you give me an example of when this would be a problem?"

#### If they express a CONCERN (⚠️):
Validate and probe for impact:
> "I hear that you're concerned about [topic]. Help me understand - what's
> the worst case if we don't address this? Who would be affected?"

#### If they have a SUGGESTION (💡):
Explore it:
> "Interesting idea about [topic]. How would you see this working in
> practice? What problem would this solve?"

#### If they think something is MISSING (➕):
Probe the gap:
> "You're right, I don't see [topic] explicitly covered. Can you tell me
> more about why this is important? What happens if we don't include it?"

#### If they need CLARIFICATION (🤔):
Help them understand, then ask:
> "[Explanation of the section]. Does that make sense? Do you have concerns
> about this approach?"

#### If they mention PRIORITY (🎯):
Validate importance:
> "It sounds like [topic] is particularly important to you. On a scale of
> 'nice to have' to 'deal-breaker', where does this fall?"

**Mode Switching:**

- If user says "let me dump" / "just listen" → Switch to listening mode
  - In listening mode: just acknowledge and capture, minimal questions
  - "📝 Got it. Anything else?"

- If user says "done" / "that's all" / "that covers it" → Move to synthesis

### Phase 4: Synthesize Feedback

Transform the conversation into structured feedback items:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FEEDBACK SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here's what I captured from our discussion:

**⚠️ Concerns:**
1. [Concern about X] - Impact: [who/what affected]
2. [Concern about Y] - Impact: [who/what affected]

**💡 Suggestions:**
1. [Suggestion for Z] - Benefit: [what it solves]

**➕ Missing Items:**
1. [Missing topic] - Why it matters: [explanation]

**🤔 Questions/Clarifications Needed:**
1. [Question about section X]

**🎯 Priority Feedback:**
- [Topic] marked as high priority by stakeholder

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Ask the stakeholder to review:
> "Did I capture everything correctly? Feel free to correct anything or add
> more context."

### Phase 5: Prioritization

Ask about priorities:

> "Before we finalize, are any of these items particularly critical - things
> that would block you from supporting this document if not addressed?"

Mark any items they identify as `🚨 HIGH PRIORITY` or `🛑 BLOCKER`.

### Phase 6: Format for Submission

Generate a GitHub-comment-ready markdown block:

```markdown
## 💬 Stakeholder Feedback

**Reviewer:** [Ask for name or use "Anonymous Stakeholder"]
**Date:** [Current date]
**Document:** [Issue title]

---

### ⚠️ Concerns

#### 1. [Concern Title]
- **Section:** [Related section if identifiable]
- **Impact:** [Who/what is affected]
- **Details:** [Full explanation]
- **Priority:** [High/Medium/Low or Blocker]

[Repeat for each concern]

---

### 💡 Suggestions

#### 1. [Suggestion Title]
- **Section:** [Related section if identifiable]
- **Benefit:** [What problem this solves]
- **Details:** [Full explanation]

[Repeat for each suggestion]

---

### ➕ Missing Items

#### 1. [Missing Item]
- **Why it matters:** [Explanation]
- **Proposed addition:** [If stakeholder suggested specific content]

[Repeat for each missing item]

---

### 🤔 Clarifications Needed

1. [Question about X]
2. [Question about Y]

---

### 🎯 Priority Summary

- **Blockers:** [List any items marked as blockers]
- **High Priority:** [List high priority items]

---

*Feedback collected via conversational elicitation session*
```

### Phase 7: Submission Options

Present submission options:

> "Your feedback is ready! How would you like to submit it?"
>
> **Option 1:** I can post this as a comment on the issue directly
> (requires GitHub MCP to be configured)
>
> **Option 2:** I'll display the formatted comment for you to copy and
> paste into GitHub yourself
>
> **Option 3:** Save to a local file

**If Option 1 (direct post):**
- Use `mcp__github__add_issue_comment` to post to the original issue
- Confirm success: "✅ Feedback posted to issue #[number]!"

**If Option 2 (copy/paste):**
- Display the full markdown in a code block
- "Copy the above and paste it as a comment on the issue."

**If Option 3 (local file):**
- Ask for filename preference
- Save using Write tool
- Confirm: "✅ Saved to [filename]"

---

## Feedback Type Reference

| Emoji | Type | When to Use |
|-------|------|-------------|
| ⚠️ | Concern | Risk, problem, or worry about current approach |
| 💡 | Suggestion | Alternative approach or improvement idea |
| ➕ | Addition | Something missing that should be included |
| 🤔 | Clarification | Need more information to understand |
| 🎯 | Priority | Feedback about what's most/least important |
| 🛑 | Blocker | Must be resolved before stakeholder can approve |

---

## Tips for Effective Elicitation

1. **Open-ended first** - Start broad, then narrow down
2. **Validate understanding** - "So what I'm hearing is..." before moving on
3. **Probe vague responses** - "Can you give me a specific example?"
4. **Distinguish concerns from preferences** - "Is this a deal-breaker or a nice-to-have?"
5. **Connect to impact** - "Who would be affected if we don't address this?"
6. **Stay neutral** - Don't defend the document, just understand the feedback
7. **Capture context** - Note *why* something matters, not just *what*

---

## Troubleshooting

**"I can't access the issue"**
- Check if the repo is private
- Verify the URL/reference format
- Offer to accept pasted content instead

**"The document is very long"**
- Focus on key sections first
- Ask: "Is there a specific section you'd like to focus on?"

**"Stakeholder is going off-topic"**
- Gently redirect: "That's interesting context. Relating it back to this
  document specifically, how does that affect [section]?"

**"Stakeholder says everything is fine"**
- Probe gently: "That's great to hear! Before we wrap up, if you had to
  pick one thing that could be improved, what would it be?"
- Try section-by-section: "Let's walk through the main sections briefly -
  anything in [section] that gave you pause?"
