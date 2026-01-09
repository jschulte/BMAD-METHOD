# Submit Feedback - Conversational Elicitation

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>ELICITATION MODE: This is a conversational workflow - interview the stakeholder to deeply understand their feedback</critical>

<workflow>

<step n="0" goal="Pre-Flight Checks">
  <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 FEEDBACK SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  </output>

  <action>Call: mcp__github__get_me()</action>
  <action>current_user = response.login</action>

  <check if="API call fails">
    <output>❌ GitHub MCP not accessible</output>
    <action>HALT</action>
  </check>
</step>

<step n="1" goal="Identify and Load Document">
  <check if="document_key is empty">
    <output>
Which document would you like to discuss?

Enter the key (e.g., "user-auth" for PRD, "2" for Epic):
    </output>
    <ask>Document key:</ask>
    <action>document_key = response</action>
  </check>

  <substep n="1a" title="Auto-detect document type">
    <check if="document_type is empty">
      <action>
        // Try to find document
        prd_path = `${docs_dir}/prd/${document_key}.md`
        epic_path = `${docs_dir}/epics/epic-${document_key}.md`

        if (file_exists(prd_path)) {
          document_type = 'prd'
          doc_path = prd_path
        } else if (file_exists(epic_path)) {
          document_type = 'epic'
          doc_path = epic_path
        } else {
          prompt_for_type = true
        }
      </action>

      <check if="prompt_for_type">
        <ask>Is this a [P]RD or [E]pic?</ask>
        <action>document_type = (response.toLowerCase().startsWith('p')) ? 'prd' : 'epic'</action>
      </check>
    </check>
  </substep>

  <substep n="1b" title="Set type-specific variables">
    <action>
      if (document_type === 'prd') {
        doc_path = `${docs_dir}/prd/${document_key}.md`
        doc_prefix = 'PRD'
        doc_label = `prd:${document_key}`
        review_label = 'type:prd-review'
        feedback_label = 'type:prd-feedback'
      } else {
        doc_path = `${docs_dir}/epics/epic-${document_key}.md`
        doc_prefix = 'Epic'
        doc_label = `epic:${document_key}`
        review_label = 'type:epic-review'
        feedback_label = 'type:epic-feedback'
      }
    </action>
  </substep>

  <substep n="1c" title="Find active review issue">
    <action>Call: mcp__github__search_issues({
      query: "repo:{{github_owner}}/{{github_repo}} label:{{review_label}} label:{{doc_label}} label:review-status:open is:open"
    })</action>

    <check if="response.items.length == 0">
      <output>
ℹ️ Note: No active feedback round found for {{doc_label}}

The document may still be in draft. Your feedback will be recorded
but won't be linked to a review cycle.
      </output>
      <action>review_issue_number = null</action>
    </check>

    <check if="response.items.length > 0">
      <action>review_issue = response.items[0]</action>
      <action>review_issue_number = review_issue.number</action>
      <output>
📋 Active review: #{{review_issue_number}} - {{review_issue.title}}
      </output>
    </check>
  </substep>

  <substep n="1d" title="Load and deeply understand document">
    <action>Read doc_path</action>
    <action>doc_content = file_content</action>

    <action>
      // Parse document structure for intelligent discussion
      doc_analysis = {
        title: extract_title(doc_content),
        version: extract_version(doc_content),
        sections: extract_sections(doc_content),
        key_themes: identify_key_themes(doc_content),
        user_stories: extract_user_stories(doc_content),
        functional_reqs: extract_functional_reqs(doc_content),
        nonfunctional_reqs: extract_nonfunctional_reqs(doc_content),
        constraints: extract_constraints(doc_content),
        open_questions: identify_open_questions(doc_content)
      }
    </action>
  </substep>
</step>

<step n="2" goal="Present Document Overview">
  <critical>Show a smart summary that demonstrates understanding - this builds trust with the stakeholder</critical>

  <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 {{doc_prefix}}: {{doc_analysis.title}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Version:** {{doc_analysis.version}}
**Status:** Feedback Round Open

**Key Themes:**
{{#each doc_analysis.key_themes}}
• {{this}}
{{/each}}

**Sections:**
{{#each doc_analysis.sections as |section index|}}
• {{section}}
{{/each}}

📎 **Full Document:** `{{doc_path}}`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  </output>
</step>

<step n="3" goal="Open Conversation">
  <critical>This is the key moment - open with genuine curiosity, not a form</critical>

  <action>Set conversation_mode = "elicitation"</action>
  <action>Set feedback_items = []</action>
  <action>Set conversation_transcript = []</action>

  <output>
I've reviewed the {{doc_prefix}} and I'm ready to hear your thoughts.

**Before we start, a quick note:**
I'll ask questions to help draw out your feedback and make sure I
fully understand your perspective. If at any point you'd rather just
tell me everything directly, just say "let me dump" and I'll switch
to listening mode.

  </output>

  <ask>
So - what brings you here today? Do you have specific feedback on
this {{doc_prefix}}, or would you like to start by asking questions
about what's proposed?
  </ask>

  <action>initial_response = response</action>
  <action>conversation_transcript.push({ role: 'stakeholder', content: initial_response })</action>
</step>

<step n="4" goal="Elicitation Loop">
  <critical>This step repeats until stakeholder is satisfied their feedback is captured</critical>
  <critical>ALWAYS validate understanding - never assume you've got it right</critical>

  <substep n="4a" title="Check for mode switch">
    <check if="response contains 'let me dump' or 'just listen' or 'dump mode'">
      <output>
Got it! I'm switching to listening mode. Go ahead and share
everything - I'll take notes and ask clarifying questions only
when absolutely necessary.

When you're done, just say "done" or "that's all".
      </output>
      <action>Set conversation_mode = "listening"</action>
      <action>Goto substep 4b</action>
    </check>

    <check if="response contains 'done' or 'that's all' or 'nothing else' or 'that covers it'">
      <action>Goto step 5 (synthesis)</action>
    </check>
  </substep>

  <substep n="4b" title="Process stakeholder input">
    <action>
      // Analyze the stakeholder's input
      input_analysis = {
        sentiment: detect_sentiment(response),
        main_topics: extract_topics(response, doc_analysis),
        related_sections: match_to_sections(response, doc_analysis),
        feedback_signals: detect_feedback_signals(response),
        questions_asked: detect_questions(response),
        clarity_level: assess_clarity(response)
      }
    </action>

    <check if="conversation_mode == 'listening'">
      <action>
        // In listening mode, just capture and briefly acknowledge
        captured_point = {
          raw_input: response,
          sections: input_analysis.related_sections,
          signals: input_analysis.feedback_signals,
          needs_clarification: []
        }
        feedback_items.push(captured_point)
      </action>

      <output>
📝 Got it{{#if input_analysis.related_sections.length}} (noted for: {{join input_analysis.related_sections ", "}}){{/if}}.

Anything else?
      </output>
      <ask></ask>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>
  </substep>

  <substep n="4c" title="Elicitation response">
    <critical>In elicitation mode, engage thoughtfully and probe deeper</critical>

    <action>
      // Determine the best follow-up approach based on input
      elicitation_strategy = determine_strategy(input_analysis, conversation_transcript)
    </action>

    <check if="input_analysis.questions_asked.length > 0">
      <action>
        // Stakeholder asked questions - answer them first, then circle back
        answers = answer_questions(input_analysis.questions_asked, doc_analysis)
      </action>

      <output>
{{answers}}

Does that help clarify things? And based on that, do you have any
concerns or thoughts about how this might work?
      </output>
      <ask></ask>
      <action>conversation_transcript.push({ role: 'claude', content: answers })</action>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>

    <check if="input_analysis.clarity_level == 'vague'">
      <action>
        // Stakeholder's point is unclear - probe gently
        probe_question = generate_clarifying_question(response, input_analysis)
      </action>

      <output>
{{probe_question}}
      </output>
      <ask></ask>
      <action>conversation_transcript.push({ role: 'claude', content: probe_question })</action>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>

    <check if="input_analysis.feedback_signals.type == 'concern'">
      <action>
        // Stakeholder expressed a concern - validate and probe for impact
        probe = generate_concern_probe(response, input_analysis)
      </action>

      <output>
I hear that you're concerned about {{input_analysis.main_topics[0]}}.

{{probe}}
      </output>
      <ask></ask>
      <action>
        captured_point = {
          type: 'concern',
          raw_input: response,
          sections: input_analysis.related_sections,
          topic: input_analysis.main_topics[0],
          needs_clarification: [probe]
        }
        feedback_items.push(captured_point)
      </action>
      <action>conversation_transcript.push({ role: 'claude', content: probe })</action>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>

    <check if="input_analysis.feedback_signals.type == 'suggestion'">
      <action>
        // Stakeholder has an idea - explore it
        explore = generate_suggestion_exploration(response, input_analysis, doc_analysis)
      </action>

      <output>
Interesting idea about {{input_analysis.main_topics[0]}}.

{{explore}}
      </output>
      <ask></ask>
      <action>
        captured_point = {
          type: 'suggestion',
          raw_input: response,
          sections: input_analysis.related_sections,
          topic: input_analysis.main_topics[0],
          needs_clarification: []
        }
        feedback_items.push(captured_point)
      </action>
      <action>conversation_transcript.push({ role: 'claude', content: explore })</action>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>

    <check if="input_analysis.feedback_signals.type == 'addition'">
      <action>
        // Stakeholder thinks something is missing
        missing_probe = generate_missing_probe(response, input_analysis, doc_analysis)
      </action>

      <output>
You're right, I don't see {{input_analysis.main_topics[0]}} explicitly
covered in the current {{doc_prefix}}.

{{missing_probe}}
      </output>
      <ask></ask>
      <action>
        captured_point = {
          type: 'addition',
          raw_input: response,
          sections: input_analysis.related_sections,
          topic: input_analysis.main_topics[0],
          needs_clarification: []
        }
        feedback_items.push(captured_point)
      </action>
      <action>conversation_transcript.push({ role: 'claude', content: missing_probe })</action>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>

    <check if="input_analysis.feedback_signals.type == 'clarification'">
      <action>
        // Stakeholder found something unclear
        clarify_probe = generate_clarification_probe(response, input_analysis, doc_analysis)
      </action>

      <output>
Good catch - let me make sure I understand what's confusing about
{{input_analysis.related_sections[0] || 'this section'}}.

{{clarify_probe}}
      </output>
      <ask></ask>
      <action>
        captured_point = {
          type: 'clarification',
          raw_input: response,
          sections: input_analysis.related_sections,
          topic: input_analysis.main_topics[0],
          needs_clarification: []
        }
        feedback_items.push(captured_point)
      </action>
      <action>conversation_transcript.push({ role: 'claude', content: clarify_probe })</action>
      <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
      <action>Goto substep 4a</action>
    </check>

    <action>
      // Default: general response - probe for more specifics
      general_probe = generate_general_probe(response, input_analysis, doc_analysis, conversation_transcript)
    </action>

    <output>
{{general_probe}}
    </output>
    <ask></ask>
    <action>
      captured_point = {
        type: 'general',
        raw_input: response,
        sections: input_analysis.related_sections,
        topic: input_analysis.main_topics[0] || 'general',
        needs_clarification: []
      }
      feedback_items.push(captured_point)
    </action>
    <action>conversation_transcript.push({ role: 'claude', content: general_probe })</action>
    <action>conversation_transcript.push({ role: 'stakeholder', content: response })</action>
    <action>Goto substep 4a</action>
  </substep>
</step>

<step n="5" goal="Synthesize Feedback">
  <critical>Transform the conversation into structured feedback items</critical>

  <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Let me summarize what I heard...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  </output>

  <action>
    // Synthesize feedback from conversation
    synthesized_feedback = synthesize_from_conversation(
      feedback_items,
      conversation_transcript,
      doc_analysis
    )

    // Group by type and section
    grouped_feedback = {
      concerns: synthesized_feedback.filter(f => f.type === 'concern'),
      suggestions: synthesized_feedback.filter(f => f.type === 'suggestion'),
      additions: synthesized_feedback.filter(f => f.type === 'addition'),
      clarifications: synthesized_feedback.filter(f => f.type === 'clarification'),
      priorities: synthesized_feedback.filter(f => f.type === 'priority')
    }
  </action>

  <output>
Based on our conversation, here's what I've captured:

{{#if grouped_feedback.concerns.length}}
**⚠️ Concerns ({{grouped_feedback.concerns.length}}):**
{{#each grouped_feedback.concerns as |fb index|}}
{{add index 1}}. **{{fb.title}}** ({{fb.section}})
   {{fb.summary}}
{{/each}}

{{/if}}
{{#if grouped_feedback.suggestions.length}}
**💡 Suggestions ({{grouped_feedback.suggestions.length}}):**
{{#each grouped_feedback.suggestions as |fb index|}}
{{add index 1}}. **{{fb.title}}** ({{fb.section}})
   {{fb.summary}}
{{/each}}

{{/if}}
{{#if grouped_feedback.additions.length}}
**➕ Missing Items ({{grouped_feedback.additions.length}}):**
{{#each grouped_feedback.additions as |fb index|}}
{{add index 1}}. **{{fb.title}}** ({{fb.section}})
   {{fb.summary}}
{{/each}}

{{/if}}
{{#if grouped_feedback.clarifications.length}}
**📋 Needs Clarification ({{grouped_feedback.clarifications.length}}):**
{{#each grouped_feedback.clarifications as |fb index|}}
{{add index 1}}. **{{fb.title}}** ({{fb.section}})
   {{fb.summary}}
{{/each}}

{{/if}}
{{#if grouped_feedback.priorities.length}}
**🔢 Priority Questions ({{grouped_feedback.priorities.length}}):**
{{#each grouped_feedback.priorities as |fb index|}}
{{add index 1}}. **{{fb.title}}** ({{fb.section}})
   {{fb.summary}}
{{/each}}

{{/if}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  </output>
</step>

<step n="6" goal="Review and Refine">
  <critical>Let stakeholder correct, refine, or add to the summary</critical>

  <ask>
How does that look? Did I capture everything correctly?

You can:
• **Correct** something I got wrong
• **Add** something I missed
• **Remove** something that isn't quite right
• Say **"looks good"** to proceed

What would you like to adjust?
  </ask>

  <check if="response contains 'looks good' or 'that's right' or 'correct' or 'proceed' or 'submit'">
    <action>Goto step 7</action>
  </check>

  <check if="response contains 'add' or 'also' or 'one more' or 'forgot'">
    <output>
Got it, let me add that to the list.
    </output>
    <action>
      // Parse additional feedback
      additional = parse_additional_feedback(response, doc_analysis)
      synthesized_feedback.push(...additional)
    </action>
    <action>Goto step 5 (re-display summary)</action>
  </check>

  <check if="response contains 'remove' or 'not quite' or 'wrong' or 'incorrect'">
    <output>
Which item should I adjust or remove? (Give me the number or describe it)
    </output>
    <ask></ask>
    <action>
      // Handle correction
      item_to_fix = identify_item(response, synthesized_feedback)
      if (response.toLowerCase().includes('remove')) {
        synthesized_feedback = synthesized_feedback.filter(f => f !== item_to_fix)
      } else {
        // Ask for correction
        ask("How should it read instead?")
        item_to_fix.summary = response
      }
    </action>
    <action>Goto step 5 (re-display summary)</action>
  </check>

  <action>
    // Treat as refinement to existing points
    refinement = process_refinement(response, synthesized_feedback)
    if (refinement.updated) {
      output("Updated. Here's the revised summary:")
    }
  </action>
  <action>Goto step 5</action>
</step>

<step n="7" goal="Prioritize Feedback Items">
  <check if="synthesized_feedback.length > 1">
    <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 PRIORITIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before we submit, which of these items are most critical to you?

{{#each synthesized_feedback as |fb index|}}
[{{add index 1}}] {{fb.title}}
{{/each}}

    </output>

    <ask>Enter the numbers of your **high priority** items (comma-separated), or "skip" to mark all as medium:</ask>

    <check if="response != 'skip'">
      <action>
        high_priority_indexes = parse_numbers(response)
        for (let i = 0; i < synthesized_feedback.length; i++) {
          synthesized_feedback[i].priority = high_priority_indexes.includes(i + 1) ? 'high' : 'medium'
        }
      </action>
    </check>

    <check if="response == 'skip'">
      <action>
        for (let fb of synthesized_feedback) {
          fb.priority = 'medium'
        }
      </action>
    </check>
  </check>

  <check if="synthesized_feedback.length == 1">
    <action>synthesized_feedback[0].priority = 'high'</action>
  </check>
</step>

<step n="8" goal="Create Feedback Issues">
  <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 SUBMITTING FEEDBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Creating {{synthesized_feedback.length}} feedback item(s)...
  </output>

  <action>
    created_issues = []

    for (const fb of synthesized_feedback) {
      // Determine type emoji
      type_emojis = {
        'concern': '⚠️',
        'suggestion': '💡',
        'addition': '➕',
        'clarification': '📋',
        'priority': '🔢',
        'scope': '📐',
        'dependency': '🔗',
        'technical_risk': '🔧',
        'story_split': '✂️'
      }
      emoji = type_emojis[fb.type] || '📝'

      // Build issue body
      issue_body = `# ${emoji} Feedback: ${fb.type.charAt(0).toUpperCase() + fb.type.slice(1)}

**Review:** ${review_issue_number ? '#' + review_issue_number : 'N/A'}
**Document:** \`${doc_label}\`
**Section:** ${fb.section}
**Type:** ${fb.type}
**Priority:** ${fb.priority}

---

## Feedback

${fb.summary}

${fb.details ? '## Details\n\n' + fb.details : ''}

${fb.suggested_change ? '## Suggested Change\n\n' + fb.suggested_change : ''}

${fb.context ? '## Context/Rationale\n\n' + fb.context : ''}

---

## Conversation Context

This feedback was captured through a conversational elicitation session.

<details>
<summary>View conversation excerpt</summary>

${fb.conversation_excerpt || 'No specific excerpt captured.'}

</details>

---

_Submitted by @${current_user} on ${new Date().toISOString().split('T')[0]}_
_Captured via conversational elicitation_
`

      // Build labels
      labels = [
        feedback_label,
        doc_label,
        `feedback-section:${fb.section.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`,
        `feedback-type:${fb.type.replace('_', '-')}`,
        'feedback-status:new',
        `priority:${fb.priority}`
      ]

      if (review_issue_number) {
        labels.push(`linked-review:${review_issue_number}`)
      }

      // Create the issue
      result = Call: mcp__github__issue_write({
        method: 'create',
        owner: github_owner,
        repo: github_repo,
        title: `${emoji} Feedback: ${fb.title}`,
        body: issue_body,
        labels: labels
      })

      created_issues.push({
        number: result.number,
        url: result.html_url,
        title: fb.title,
        type: fb.type,
        priority: fb.priority
      })

      output(`  ✅ #${result.number}: ${fb.title}`)

      // Link to review issue if exists
      if (review_issue_number) {
        link_comment = `${emoji} **New Feedback** from @${current_user}

**${fb.title}** → #${result.number}
Type: ${fb.type} | Priority: ${fb.priority} | Section: ${fb.section}`

        Call: mcp__github__add_issue_comment({
          owner: github_owner,
          repo: github_repo,
          issue_number: review_issue_number,
          body: link_comment
        })
      }
    }
  </action>
</step>

<step n="9" goal="Completion">
  <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ FEEDBACK SUBMITTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**{{created_issues.length}} feedback item(s) created:**

{{#each created_issues}}
• #{{number}}: {{title}} ({{type}}, {{priority}} priority)
  {{url}}
{{/each}}

{{#if review_issue_number}}
All items linked to Review #{{review_issue_number}}.
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thank you for taking the time to share your thoughts! 🙏

The Product Owner will be notified and your feedback will be
considered during the synthesis phase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Would you like to:**
[1] Submit more feedback on this document
[2] View all feedback for this document
[3] Return to My Tasks
[4] Done

  </output>

  <ask>Choice:</ask>

  <check if="choice == 1">
    <action>Reset feedback_items and synthesized_feedback</action>
    <action>Goto step 3 (start new conversation)</action>
  </check>

  <check if="choice == 2">
    <action>Load workflow: view-feedback with document_key, document_type</action>
  </check>

  <check if="choice == 3">
    <action>Load workflow: my-tasks</action>
  </check>

  <check if="choice == 4">
    <output>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Have a great day! 👋
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    </output>
    <action>Exit</action>
  </check>
</step>

</workflow>

## Elicitation Techniques

The workflow uses these elicitation patterns:

### 1. Open-Ended Start
Start with genuine curiosity, not a form:
- "What brings you here today?"
- "Do you have specific feedback, or would you like to start with questions?"

### 2. Active Listening Signals
- "I hear that you're concerned about..."
- "So if I understand correctly..."
- "That's an interesting point about..."

### 3. Probing Questions by Type

**For vague feedback:**
- "Can you give me an example of when this might be a problem?"
- "What would you expect to happen instead?"
- "How would this affect your workflow?"

**For concerns:**
- "What's the worst case scenario if this isn't addressed?"
- "Has something like this caused issues before?"
- "Who else might be affected by this?"

**For suggestions:**
- "How would that change things for you day-to-day?"
- "Are there trade-offs we should consider?"
- "Have you seen this work well elsewhere?"

**For missing items:**
- "Can you walk me through a scenario where this would be needed?"
- "Is this something you need in the MVP, or could it come later?"
- "Are there dependencies on other features?"

**For clarification requests:**
- "What specifically is unclear - the what, the why, or the how?"
- "What would help make this clearer?"
- "Is it the terminology or the concept that's confusing?"

### 4. Mode Switching
Allow stakeholder to control conversation style:
- "let me dump" → Switch to listening mode
- "ask me questions" → Switch to elicitation mode
- "done" / "that's all" → Move to synthesis

### 5. Validation Before Submission
Always show what was captured:
- Display synthesized summary
- Allow corrections
- Let stakeholder prioritize

## Helper Functions

```javascript
// Extract document title
function extract_title(content) {
  const match = content.match(/^#\s+(?:PRD|Epic):\s*(.+)$/m);
  return match ? match[1].trim() : 'Untitled Document';
}

// Extract version from document
function extract_version(content) {
  const match = content.match(/\*\*Version:\*\*\s*(\d+)/);
  return match ? match[1] : '1';
}

// Extract section headers from document
function extract_sections(content) {
  const sections = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      const section = match[1].trim();
      if (!['Metadata', 'Version History', 'Sign-off Status'].includes(section)) {
        sections.push(section);
      }
    }
  }
  return sections;
}

// Identify key themes in document
function identify_key_themes(content) {
  // LLM analyzes content to extract 3-5 key themes
  // This helps Claude understand what the document is about
  return ["Theme 1", "Theme 2", "Theme 3"]; // Placeholder - LLM generates
}

// Extract user stories
function extract_user_stories(content) {
  const stories = [];
  const regex = /###\s+(US\d+):\s*(.+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    stories.push({ id: match[1], title: match[2] });
  }
  return stories;
}

// Extract functional requirements
function extract_functional_reqs(content) {
  const reqs = [];
  const regex = /###\s+(FR\d+):\s*(.+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    reqs.push({ id: match[1], title: match[2] });
  }
  return reqs;
}

// Extract non-functional requirements
function extract_nonfunctional_reqs(content) {
  const reqs = [];
  const regex = /###\s+(NFR\d+):\s*(.+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    reqs.push({ id: match[1], title: match[2] });
  }
  return reqs;
}

// Extract constraints
function extract_constraints(content) {
  const constraintSection = content.match(/## Constraints\n\n([\s\S]*?)(?:\n##|$)/);
  if (!constraintSection) return [];

  return constraintSection[1]
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim());
}

// Identify areas that might have open questions
function identify_open_questions(content) {
  const markers = ['TBD', 'TODO', '?', 'to be determined', 'needs clarification'];
  const questions = [];

  for (const marker of markers) {
    if (content.toLowerCase().includes(marker.toLowerCase())) {
      questions.push(marker);
    }
  }

  return questions;
}

// Detect sentiment from response
function detect_sentiment(response) {
  // LLM analyzes sentiment: positive, negative, neutral, confused, frustrated
  return 'neutral'; // Placeholder
}

// Extract topics from response
function extract_topics(response, doc_analysis) {
  // LLM identifies what the stakeholder is talking about
  return []; // Placeholder
}

// Match response to document sections
function match_to_sections(response, doc_analysis) {
  // LLM matches response content to relevant document sections
  return ['General']; // Placeholder
}

// Detect what type of feedback this is
function detect_feedback_signals(response) {
  // LLM analyzes to determine: concern, suggestion, addition, clarification, priority
  return { type: 'general', confidence: 0.5 }; // Placeholder
}

// Detect if stakeholder asked questions
function detect_questions(response) {
  const questions = [];
  const sentences = response.split(/[.!?]+/);

  for (const sentence of sentences) {
    if (sentence.includes('?') || sentence.toLowerCase().startsWith('what') ||
        sentence.toLowerCase().startsWith('how') || sentence.toLowerCase().startsWith('why')) {
      questions.push(sentence.trim());
    }
  }

  return questions;
}

// Assess how clear/specific the response is
function assess_clarity(response) {
  // LLM determines if response is: clear, vague, partial
  return response.length < 50 ? 'vague' : 'clear'; // Simple heuristic
}

// Generate clarifying question for vague input
function generate_clarifying_question(response, analysis) {
  // LLM generates appropriate follow-up question
  return "Can you tell me more about what you mean by that?"; // Placeholder
}

// Generate probe for concerns
function generate_concern_probe(response, analysis) {
  // LLM generates probe to understand impact
  return "Can you help me understand the potential impact if this isn't addressed?"; // Placeholder
}

// Generate exploration question for suggestions
function generate_suggestion_exploration(response, analysis, doc) {
  // LLM explores the suggestion
  return "How would you envision that working in practice?"; // Placeholder
}

// Generate probe for missing items
function generate_missing_probe(response, analysis, doc) {
  // LLM probes the importance and scope
  return "Can you walk me through a scenario where this would be critical?"; // Placeholder
}

// Generate probe for clarification requests
function generate_clarification_probe(response, analysis, doc) {
  // LLM helps understand what's unclear
  return "What specifically about this section is unclear - the intent or the implementation?"; // Placeholder
}

// Generate general follow-up probe
function generate_general_probe(response, analysis, doc, transcript) {
  // LLM generates appropriate follow-up based on conversation context
  return "Is there anything else about this you'd like to discuss, or shall we move on?"; // Placeholder
}

// Answer stakeholder questions about the document
function answer_questions(questions, doc_analysis) {
  // LLM answers based on document content
  return "Based on what's in the document..."; // Placeholder
}

// Synthesize feedback from conversation
function synthesize_from_conversation(items, transcript, doc) {
  // LLM synthesizes structured feedback from the conversation
  // Returns array of feedback objects with: type, title, section, summary, details, suggested_change, context, priority
  return []; // Placeholder
}

// Parse additional feedback from refinement response
function parse_additional_feedback(response, doc) {
  // LLM parses additional feedback points
  return []; // Placeholder
}

// Identify which item user is referring to
function identify_item(response, feedback_list) {
  // Match by number or description
  return feedback_list[0]; // Placeholder
}

// Process refinement to existing feedback
function process_refinement(response, feedback_list) {
  // LLM updates feedback based on refinement
  return { updated: false }; // Placeholder
}

// Parse comma-separated numbers
function parse_numbers(response) {
  return response
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n));
}

// Check if file exists
function file_exists(path) {
  // Implemented by runtime
  return true;
}
```

## Natural Language Triggers

This workflow responds to:
- "Submit feedback on [document]"
- "I have feedback for the auth PRD"
- "Give feedback on epic 2"
- "I want to discuss the PRD"
- "Let me share my thoughts on [document]"
- "Can we talk about the requirements?"
- Menu trigger: `SF`
