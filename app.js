(function () {
  "use strict";

  const ANALYTICS_KEY = "jobpostingexpiryqa_analytics_events";
  const INTENT_KEY = "jobpostingexpiryqa_purchase_intents";
  const GITHUB_ISSUE_URL = "https://github.com/ert93333-ops/job-posting-expiry-qa-briefs/issues/new";

  const SAMPLE_JSONLD = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Senior SEO Engineer",
    "description": "Own technical SEO systems for a global career site.",
    "datePosted": "2026-03-01",
    "employmentType": "FULL_TIME",
    "jobLocationType": "TELECOMMUTE",
    "directApply": true,
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "USD"
    }
  }, null, 2);

  const SAMPLE_VISIBLE_NOTES = [
    "Visible title is SEO Specialist, but schema title says Senior SEO Engineer.",
    "The page is a job search/list page with multiple open and closed roles.",
    "The visible page says the role is closed to applicants."
  ].join("\n");

  const SAMPLE_EXPIRY_NOTES = [
    "Role closed yesterday in the ATS.",
    "validThrough is not assigned and the page should stop accepting applicants."
  ].join("\n");

  const SAMPLE_LOCATION_NOTES = [
    "Role is remote, but applicant location requirements are not assigned.",
    "No physical jobLocation address is listed for fallback handling."
  ].join("\n");

  const SAMPLE_APPLY_NOTES = [
    "Apply URL still points to a closed ATS requisition behind a login wall.",
    "directApply is enabled in schema, but the applicant flow is not direct.",
    "Salary range is not visible and baseSalary has no value."
  ].join("\n");

  const SAMPLE_OWNER_NOTES = [
    "Cleanup notes are incomplete.",
    "Recruiting, ATS, frontend, content, and SEO teams still need launch alignment."
  ].join("\n");

  const OWNER_PATTERN = /owner|assigned|ticket|decision|remediation|fix|resolved|approved|retest|signoff|recruiting lead|ats lead|seo lead|frontend lead/i;

  const state = {
    latestBrief: null,
    latestBriefText: "",
    lastRemoteBody: "",
    signupStarted: false,
    pricingTracked: false
  };

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function setText(selector, value) {
    const element = qs(selector);
    if (element) element.textContent = value;
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function hasText(value, pattern) {
    return pattern.test(String(value || ""));
  }

  function readArray(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function writeArray(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Local storage can be unavailable in privacy modes. The workflow still works.
    }
  }

  function getUtm() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || ""
    };
  }

  function track(eventName, detail) {
    const events = readArray(ANALYTICS_KEY);
    events.push({
      event: eventName,
      detail: detail || {},
      utm: getUtm(),
      path: window.location.pathname,
      createdAt: new Date().toISOString()
    });
    writeArray(ANALYTICS_KEY, events.slice(-200));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function listHtml(items, emptyText) {
    if (!items.length) return "<p>" + escapeHtml(emptyText) + "</p>";
    return "<ul>" + items.map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    }).join("") + "</ul>";
  }

  function unique(items) {
    return Array.from(new Set(items.map(clean).filter(Boolean)));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [value].filter(function (item) { return item !== undefined && item !== null; });
  }

  function typeIncludes(item, typeName) {
    const type = item && item["@type"];
    if (Array.isArray(type)) {
      return type.map(lower).some(function (value) { return value === typeName.toLowerCase(); });
    }
    return lower(type) === typeName.toLowerCase();
  }

  function extractBalancedJson(raw) {
    const text = String(raw || "");
    const values = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escapeNext = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{" || char === "[") {
        if (depth === 0) start = index;
        depth += 1;
      }
      if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          values.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }
    return values;
  }

  function jsonCandidates(raw) {
    const withoutScripts = String(raw || "")
      .replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi, "")
      .replace(/<\/script>/gi, "")
      .trim();
    if (!withoutScripts) return [];
    try {
      return [JSON.parse(withoutScripts)];
    } catch (error) {
      // Fall through to balanced snippet extraction.
    }
    const parsed = [];
    extractBalancedJson(withoutScripts).forEach(function (candidate) {
      try {
        parsed.push(JSON.parse(candidate));
      } catch (error) {
        // Invalid fragments are ignored; parse warnings are emitted separately.
      }
    });
    return parsed;
  }

  function topLevelJsonObjects(raw) {
    const items = [];
    function visit(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== "object") return;
      if (Array.isArray(node["@graph"])) {
        node["@graph"].forEach(visit);
        return;
      }
      items.push(node);
    }
    jsonCandidates(raw).forEach(visit);
    return items;
  }

  function jobItems(raw) {
    return topLevelJsonObjects(raw).filter(function (item) {
      return typeIncludes(item, "JobPosting");
    });
  }

  function isPastDate(value) {
    const text = clean(value);
    if (!text) return false;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return false;
    return date.getTime() < Date.now();
  }

  function analyzeJobPosting(input) {
    const topObjects = topLevelJsonObjects(input.jsonld);
    const jobs = jobItems(input.jsonld);
    const notes = [input.visibleNotes, input.expiryNotes, input.locationNotes, input.applyNotes, input.ownerNotes, input.pageType].join("\n");
    const parseSummary = [
      "Page type: " + clean(input.pageType),
      "Parsed " + topObjects.length + " top-level JSON-LD objects.",
      "Detected " + jobs.length + " JobPosting objects."
    ];
    const fieldWarnings = [];
    const expiryWarnings = [];
    const listPageWarnings = [];
    const visibleWarnings = [];
    const locationWarnings = [];
    const applyWarnings = [];
    const salaryWarnings = [];
    const ownerWarnings = [];
    const handoffReminders = [
      "Retest after recruiting, ATS, frontend template, content, canonical, sitemap, or SEO owner changes ship.",
      "Confirm whether the job should accept applicants before publishing or leaving JobPosting markup live.",
      "Treat this as technical SEO and launch QA guidance; it does not crawl pages, call Rich Results Test, use Search Console, connect to an ATS, provide legal or HR advice, or guarantee indexing, ranking, eligibility, or applicant-flow outcomes."
    ];

    if (!jobs.length) {
      fieldWarnings.push("missing JobPosting or required job field: no JobPosting object was found in the pasted JSON-LD sample.");
    }

    jobs.forEach(function (job, index) {
      const label = "JobPosting " + (index + 1);
      if (!clean(job.title)) fieldWarnings.push("missing JobPosting or required job field: " + label + " is missing title.");
      if (!clean(job.description)) fieldWarnings.push("missing JobPosting or required job field: " + label + " is missing description.");
      if (!clean(job.datePosted)) fieldWarnings.push("missing JobPosting or required job field: " + label + " is missing datePosted.");
      if (!job.hiringOrganization) fieldWarnings.push("missing JobPosting or required job field: " + label + " is missing hiringOrganization.");
      if (!job.identifier) fieldWarnings.push("missing JobPosting or required job field: " + label + " is missing identifier.");
      if (!job.jobLocation && lower(job.jobLocationType) !== "telecommute") {
        fieldWarnings.push("missing JobPosting or required job field: " + label + " is missing jobLocation.");
      }
      if (!clean(job.validThrough)) {
        expiryWarnings.push("expired or missing validThrough: " + label + " has no validThrough cleanup date.");
      } else if (isPastDate(job.validThrough)) {
        expiryWarnings.push("expired or missing validThrough: " + label + " validThrough is already in the past.");
      }
    });

    if (hasText(input.expiryNotes, /closed|expired|not accepting|filled|paused|yesterday|last week|remove|cleanup/i)) {
      expiryWarnings.push("expired or missing validThrough: expiry notes say the role is closed, expired, paused, filled, or should stop accepting applicants.");
    }

    if (hasText(input.pageType + "\n" + input.visibleNotes, /list|search|multiple|results|category|archive/i) || jobs.length > 1) {
      listPageWarnings.push("list-page or multi-job markup risk: JobPosting markup appears on a list/search/results page or includes multiple jobs.");
    }

    if (hasText(input.visibleNotes, /mismatch|different|schema|title|location|closed|not visible|multiple|list/i)) {
      visibleWarnings.push("visible job/schema mismatch: visible title, location, status, or page context appears different from the pasted JobPosting data.");
    }
    if (!hasText(input.visibleNotes, /visible|title|description|job|role|page/i)) {
      visibleWarnings.push("visible job/schema mismatch: visible notes do not confirm title, description, status, and page context parity.");
    }

    jobs.forEach(function (job, index) {
      const label = "JobPosting " + (index + 1);
      if (lower(job.jobLocationType) === "telecommute" && !job.applicantLocationRequirements) {
        locationWarnings.push("remote/location handoff gap: " + label + " is marked TELECOMMUTE but applicantLocationRequirements is missing.");
      }
      if (!job.jobLocation && !hasText(input.locationNotes, /address|office|country|remote|applicant location|telecommute/i)) {
        locationWarnings.push("remote/location handoff gap: " + label + " has no jobLocation and location notes do not confirm remote/applicant location handling.");
      }
    });
    if (hasText(input.locationNotes, /remote|work from home|telecommute|no physical|missing|not assigned/i)) {
      locationWarnings.push("remote/location handoff gap: location notes need explicit remote/applicant-location ownership before launch.");
    }

    if (hasText(input.applyNotes, /closed|login|not direct|broken|redirect|ats|stale|old requisition|not accepting/i)) {
      applyWarnings.push("apply URL or directApply handoff gap: apply notes suggest a closed, stale, gated, redirected, or non-direct applicant flow.");
    }
    jobs.forEach(function (job, index) {
      if (job.directApply === true && hasText(input.applyNotes, /not direct|login|gated|redirect|ats/i)) {
        applyWarnings.push("apply URL or directApply handoff gap: JobPosting " + (index + 1) + " has directApply true but the apply flow notes do not confirm a direct application path.");
      }
      if (!job.url && !hasText(input.applyNotes, /apply|application|ats|url|link/i)) {
        applyWarnings.push("apply URL or directApply handoff gap: JobPosting " + (index + 1) + " has no URL and apply notes do not confirm the application path.");
      }
    });

    jobs.forEach(function (job, index) {
      if (job.baseSalary && (!job.baseSalary.value || hasText(input.applyNotes, /salary.*not visible|no salary|benefit|compensation missing|baseSalary has no value/i))) {
        salaryWarnings.push("salary/benefit disclosure review reminder: JobPosting " + (index + 1) + " includes salary-related markup or notes that need visible-page and owner review.");
      }
    });
    if (hasText(input.applyNotes, /salary|benefit|compensation|pay range|baseSalary/i)) {
      salaryWarnings.push("salary/benefit disclosure review reminder: compensation or benefits notes need owner review before handoff.");
    }

    if (!OWNER_PATTERN.test(input.ownerNotes)) {
      ownerWarnings.push("missing owner remediation decision: owner notes do not name the recruiting, ATS, frontend, content, or SEO owner and the required fix/retest decision.");
    }
    if (
      fieldWarnings.length ||
      expiryWarnings.length ||
      listPageWarnings.length ||
      visibleWarnings.length ||
      locationWarnings.length ||
      applyWarnings.length ||
      salaryWarnings.length
    ) {
      if (!hasText(input.ownerNotes, /owner|assigned|ticket|decision|fix|retest|signoff|approved|date/i)) {
        ownerWarnings.push("missing owner remediation decision: JobPosting findings need an explicit owner, launch fix, and retest date before handoff.");
      }
    }

    const issueCount =
      fieldWarnings.length +
      expiryWarnings.length +
      listPageWarnings.length +
      visibleWarnings.length +
      locationWarnings.length +
      applyWarnings.length +
      salaryWarnings.length +
      ownerWarnings.length;
    const status = fieldWarnings.length || expiryWarnings.length || listPageWarnings.length || visibleWarnings.length || locationWarnings.length || applyWarnings.length
      ? "Fix before launch"
      : salaryWarnings.length || ownerWarnings.length
        ? "Manual JobPosting review"
        : "Ready for final JobPosting QA";

    return {
      status: status,
      issueCount: issueCount,
      pageType: clean(input.pageType),
      parseSummary: unique(parseSummary),
      fieldWarnings: unique(fieldWarnings),
      expiryWarnings: unique(expiryWarnings),
      listPageWarnings: unique(listPageWarnings),
      visibleWarnings: unique(visibleWarnings),
      locationWarnings: unique(locationWarnings),
      applyWarnings: unique(applyWarnings),
      salaryWarnings: unique(salaryWarnings),
      ownerWarnings: unique(ownerWarnings),
      handoffReminders: unique(handoffReminders)
    };
  }

  function briefToText(brief) {
    return [
      "Job Posting Expiry QA Briefs",
      "Status: " + brief.status,
      "Issue count: " + brief.issueCount,
      "Page type: " + brief.pageType,
      "",
      "Parse summary:",
      brief.parseSummary.length ? brief.parseSummary.join("\n") : "None found.",
      "",
      "Required job field warnings:",
      brief.fieldWarnings.length ? brief.fieldWarnings.join("\n") : "None found.",
      "",
      "Expiry/status warnings:",
      brief.expiryWarnings.length ? brief.expiryWarnings.join("\n") : "None found.",
      "",
      "List-page markup warnings:",
      brief.listPageWarnings.length ? brief.listPageWarnings.join("\n") : "None found.",
      "",
      "Visible/schema parity warnings:",
      brief.visibleWarnings.length ? brief.visibleWarnings.join("\n") : "None found.",
      "",
      "Remote/location handoff warnings:",
      brief.locationWarnings.length ? brief.locationWarnings.join("\n") : "None found.",
      "",
      "Apply URL handoff warnings:",
      brief.applyWarnings.length ? brief.applyWarnings.join("\n") : "None found.",
      "",
      "Salary and benefit review reminders:",
      brief.salaryWarnings.length ? brief.salaryWarnings.join("\n") : "None found.",
      "",
      "Owner remediation reminders:",
      brief.ownerWarnings.length ? brief.ownerWarnings.join("\n") : "None found.",
      "",
      "Handoff reminders:",
      brief.handoffReminders.join("\n"),
      "",
      "Note: This is technical SEO and launch QA guidance, not a crawler, Rich Results Test runner, Search Console diagnostic, ATS integration, legal advice, HR advice, eligibility guarantee, or applicant-flow guarantee."
    ].join("\n");
  }

  function renderBrief(brief) {
    const output = qs("#brief-output");
    const copyButton = qs("#copy-brief");
    const outputPanel = qs(".output-panel");
    const statusPill = qs("#status-pill");
    if (!output) return;

    output.classList.remove("empty");
    output.classList.add("is-updated");
    window.setTimeout(function () { output.classList.remove("is-updated"); }, 480);
    output.innerHTML = [
      '<div class="brief-summary">',
      '<strong>' + escapeHtml(brief.status) + '</strong>',
      '<span>' + brief.issueCount + ' checks need attention</span>',
      "</div>",
      '<section class="brief-section"><h4>Parse summary</h4>' + listHtml(brief.parseSummary, "No parse notes found.") + "</section>",
      '<section class="brief-section"><h4>Required job field warnings</h4>' + listHtml(brief.fieldWarnings, "No required job field warnings found.") + "</section>",
      '<section class="brief-section"><h4>Expiry/status warnings</h4>' + listHtml(brief.expiryWarnings, "No expiry/status warnings found.") + "</section>",
      '<section class="brief-section"><h4>List-page markup warnings</h4>' + listHtml(brief.listPageWarnings, "No list-page markup warnings found.") + "</section>",
      '<section class="brief-section"><h4>Visible/schema parity warnings</h4>' + listHtml(brief.visibleWarnings, "No visible/schema parity warnings found.") + "</section>",
      '<section class="brief-section"><h4>Remote/location handoff warnings</h4>' + listHtml(brief.locationWarnings, "No remote/location handoff warnings found.") + "</section>",
      '<section class="brief-section"><h4>Apply URL handoff warnings</h4>' + listHtml(brief.applyWarnings, "No apply URL handoff warnings found.") + "</section>",
      '<section class="brief-section"><h4>Salary and benefit review reminders</h4>' + listHtml(brief.salaryWarnings, "No salary or benefit review reminders found.") + "</section>",
      '<section class="brief-section"><h4>Owner remediation reminders</h4>' + listHtml(brief.ownerWarnings, "No owner remediation reminders found.") + "</section>",
      '<section class="brief-section"><h4>Handoff reminders</h4>' + listHtml(brief.handoffReminders, "No handoff reminders found.") + "</section>"
    ].join("");
    setText("#output-title", "JobPosting QA brief ready");
    setText("#status-pill", brief.status);
    if (copyButton) copyButton.disabled = false;
    if (outputPanel) {
      outputPanel.classList.add("has-brief");
      outputPanel.classList.toggle("status-good", brief.status === "Ready for final JobPosting QA");
      outputPanel.classList.toggle("status-warning", brief.status === "Manual JobPosting review");
      outputPanel.classList.toggle("status-danger", brief.status === "Fix before launch");
    }
    if (statusPill) {
      statusPill.classList.toggle("status-good", brief.status === "Ready for final JobPosting QA");
      statusPill.classList.toggle("status-warning", brief.status === "Manual JobPosting review");
      statusPill.classList.toggle("status-danger", brief.status === "Fix before launch");
    }
    state.latestBrief = brief;
    state.latestBriefText = briefToText(brief);
  }

  function pulseClass(element, className, duration) {
    if (!element) return;
    element.classList.add(className);
    window.setTimeout(function () { element.classList.remove(className); }, duration || 600);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall through to textarea fallback for headless browser clipboard blocks.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function setupAuditor() {
    const form = qs("#auditor-form");
    const jsonldInput = qs("#jsonld-input");
    const visibleNotes = qs("#visible-notes");
    const expiryNotes = qs("#expiry-notes");
    const locationNotes = qs("#location-notes");
    const applyNotes = qs("#apply-notes");
    const ownerNotes = qs("#owner-notes");
    const loadSample = qs("#load-sample");
    const error = qs("#workflow-error");
    const copyButton = qs("#copy-brief");
    if (!form || !jsonldInput) return;

    if (loadSample) {
      loadSample.addEventListener("click", function () {
        jsonldInput.value = SAMPLE_JSONLD;
        if (visibleNotes) visibleNotes.value = SAMPLE_VISIBLE_NOTES;
        if (expiryNotes) expiryNotes.value = SAMPLE_EXPIRY_NOTES;
        if (locationNotes) locationNotes.value = SAMPLE_LOCATION_NOTES;
        if (applyNotes) applyNotes.value = SAMPLE_APPLY_NOTES;
        if (ownerNotes) ownerNotes.value = SAMPLE_OWNER_NOTES;
        if (qs("#page-type")) qs("#page-type").value = "Job list or search page";
        jsonldInput.focus();
        pulseClass(loadSample, "is-confirmed", 520);
        track("sample_job_posting_rows_loaded");
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      track("core_action_started", { triggerSource: "auditor_form" });
      if (error) error.textContent = "";

      const input = {
        jsonld: jsonldInput.value.trim(),
        visibleNotes: visibleNotes ? visibleNotes.value.trim() : "",
        expiryNotes: expiryNotes ? expiryNotes.value.trim() : "",
        locationNotes: locationNotes ? locationNotes.value.trim() : "",
        applyNotes: applyNotes ? applyNotes.value.trim() : "",
        ownerNotes: ownerNotes ? ownerNotes.value.trim() : "",
        pageType: qs("#page-type") ? qs("#page-type").value : ""
      };
      const inputLength = Object.keys(input).reduce(function (total, key) { return total + String(input[key]).length; }, 0);
      if (!input.jsonld) {
        if (error) error.textContent = "Paste JobPosting JSON-LD or load the sample before generating a JobPosting QA brief.";
        track("core_action_failed", { reason: "empty_input" });
        return;
      }

      const brief = analyzeJobPosting(input);
      renderBrief(brief);
      track("core_action_completed", {
        issueCount: brief.issueCount,
        status: brief.status,
        pageType: brief.pageType,
        inputLength: inputLength
      });
    });

    if (copyButton) {
      copyButton.addEventListener("click", function () {
        if (!state.latestBriefText) return;
        copyText(state.latestBriefText).then(function () {
          copyButton.textContent = "Copied brief";
          pulseClass(copyButton, "is-confirmed", 700);
          track("brief_copied", { issueCount: state.latestBrief ? state.latestBrief.issueCount : 0 });
          window.setTimeout(function () { copyButton.textContent = "Copy brief"; }, 1400);
        });
      });
    }
  }

  function buildRemoteIssue(intent) {
    const body = [
      "Job Posting Expiry QA Briefs early-access request",
      "",
      "Role: " + intent.role,
      "Job page type: " + intent.jobPageType,
      "Job templates: " + intent.templateCount,
      "Plan interest: " + intent.plan,
      "Willingness to pay: " + intent.budget,
      "Purchase intent: " + (intent.purchaseIntent ? "yes" : "no"),
      "",
      "Biggest JobPosting QA pain:",
      intent.pain,
      "",
      "Note: Email is intentionally omitted from this public issue body."
    ].join("\n");
    state.lastRemoteBody = body;
    const params = new URLSearchParams({
      title: "Job Posting Expiry QA Briefs early-access request",
      body: body,
      labels: "early-access,purchase-intent,demo-request",
      template: "demo_request.md"
    });
    return GITHUB_ISSUE_URL + "?" + params.toString();
  }

  function setupWaitlist() {
    const form = qs("#waitlist-form");
    const status = qs("#waitlist-status");
    const handoff = qs("#handoff-panel");
    const remoteLink = qs("#remote-intent-link");
    const copyRequest = qs("#copy-request");
    const planSelect = qs("#plan");
    if (!form) return;

    form.addEventListener("focusin", function () {
      if (!state.signupStarted) {
        state.signupStarted = true;
        track("signup_started", { triggerSource: "waitlist_form" });
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!state.signupStarted) {
        state.signupStarted = true;
        track("signup_started", { triggerSource: "waitlist_submit" });
      }
      const intent = {
        email: qs("#email") ? qs("#email").value.trim() : "",
        role: qs("#role") ? qs("#role").value : "",
        jobPageType: qs("#job-page-type") ? qs("#job-page-type").value : "",
        templateCount: qs("#template-count") ? qs("#template-count").value : "",
        plan: planSelect ? planSelect.value : "",
        budget: qs("#budget") ? qs("#budget").value : "",
        pain: qs("#pain") ? qs("#pain").value.trim() : "",
        purchaseIntent: qs("#purchase-intent") ? qs("#purchase-intent").checked : false,
        createdAt: new Date().toISOString(),
        utm: getUtm()
      };
      const intents = readArray(INTENT_KEY);
      intents.push(intent);
      writeArray(INTENT_KEY, intents.slice(-100));

      const remoteHref = buildRemoteIssue(intent);
      if (remoteLink) remoteLink.href = remoteHref;
      if (handoff) {
        handoff.hidden = false;
        pulseClass(handoff, "is-confirmed", 700);
      }
      if (status) status.textContent = "You are on the early access list. Public-safe request details are ready.";

      track("waitlist_submitted", { role: intent.role, plan: intent.plan, templateCount: intent.templateCount });
      track("feedback_submitted", { triggerSource: "waitlist_form", painLength: intent.pain.length });
      track("remote_intent_ready", { hasRemoteLink: Boolean(remoteHref) });
      if (intent.purchaseIntent) track("checkout_intent", { plan: intent.plan, budget: intent.budget });
    });

    if (copyRequest) {
      copyRequest.addEventListener("click", function () {
        if (!state.lastRemoteBody) return;
        copyText(state.lastRemoteBody).then(function () {
          copyRequest.textContent = "Copied request details";
          pulseClass(copyRequest, "is-confirmed", 700);
          track("remote_intent_copied", { bodyLength: state.lastRemoteBody.length });
          window.setTimeout(function () { copyRequest.textContent = "Copy request details"; }, 1500);
        });
      });
    }
  }

  function setupPlanButtons() {
    const waitlist = qs("#waitlist");
    const planSelect = qs("#plan");
    qsa(".plan-button").forEach(function (button) {
      button.addEventListener("click", function () {
        const plan = button.getAttribute("data-plan") || "";
        if (planSelect && plan) planSelect.value = plan;
        track("pricing_viewed", { triggerSource: "plan_button" });
        state.pricingTracked = true;
        track("checkout_started", { plan: plan, triggerSource: "pricing_button" });
        pulseClass(button, "is-confirmed", 500);
        if (waitlist) waitlist.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function setupTracking() {
    track("landing_viewed", { product: "Job Posting Expiry QA Briefs" });
    qsa("[data-track-cta]").forEach(function (element) {
      element.addEventListener("click", function () {
        track("cta_clicked", { cta: element.getAttribute("data-track-cta") || clean(element.textContent) });
      });
    });
    const pricing = qs("#pricing");
    if (pricing && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !state.pricingTracked) {
            state.pricingTracked = true;
            track("pricing_viewed", { triggerSource: "scroll" });
            observer.disconnect();
          }
        });
      }, { threshold: 0.35 });
      observer.observe(pricing);
    }
  }

  function setupChrome() {
    const header = qs("[data-header]");
    if (!header) return;
    function updateHeader() {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    }
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  function setupReveal() {
    const elements = qsa(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach(function (element) { element.classList.add("is-visible"); });
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach(function (element) { observer.observe(element); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupTracking();
    setupChrome();
    setupReveal();
    setupAuditor();
    setupWaitlist();
    setupPlanButtons();
  });
}());
