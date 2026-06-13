/**
 * Customer-facing CN classification result rendering.
 * Keeps full API data available under collapsible "Technical Analysis".
 */
(function (global) {
  const FAMILY_LABELS = {
    temperature_sensor: "a temperature measuring sensor",
    pressure_sensor: "a pressure sensor",
    proximity_sensor: "a proximity or inductive sensor",
    sensor: "a measuring sensor",
    industrial_automation: "industrial automation equipment (e.g. PLC)",
    electronics_laptop: "a laptop or portable computer",
    cycles_bicycle: "a bicycle",
    stationery_pen: "a pen (stationery)",
    industrial_valve: "a valve",
    apparel_trousers: "trousers or pants",
    apparel_trousers_mens: "men's trousers",
    apparel_shirts: "shirts or tops",
    goods_vehicle: "a goods vehicle (truck or lorry)",
    tractor_unit: "a tractor unit",
    passenger_vehicle: "a passenger motor vehicle",
    trailer: "a trailer or semi-trailer",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function confidenceLevelClass(confidence, prefix) {
    const pct = (confidence ?? 0) * 100;
    const base = prefix || "confidence";
    if (pct > 90) return `${base}-high`;
    if (pct >= 70) return `${base}-medium`;
    return `${base}-low`;
  }

  function parseMatchExplanation(text) {
    const raw = String(text || "").trim();
    const result = {
      raw,
      entitiesLine: "",
      brands: [],
      families: [],
      models: [],
      vehicleTypes: [],
      condition: "",
      rankingLayers: [],
      keyTerms: [],
      rankedCnCode: "",
    };

    if (!raw) return result;

    const entitiesMatch = raw.match(/Entities:\s*([^.]+)\./i);
    if (entitiesMatch) {
      result.entitiesLine = entitiesMatch[1].trim();
      entitiesMatch[1].split(";").forEach((part) => {
        const piece = part.trim();
        const eq = piece.indexOf("=");
        if (eq === -1) return;
        const key = piece.slice(0, eq).trim().toLowerCase();
        const value = piece.slice(eq + 1).trim();
        if (key === "brand") result.brands = value.split(",").map((s) => s.trim());
        if (key === "family") result.families = value.split(",").map((s) => s.trim());
        if (key === "model") result.models = value.split(",").map((s) => s.trim());
        if (key === "vehicle_type") result.vehicleTypes = value.split(",").map((s) => s.trim());
        if (key === "condition") result.condition = value;
      });
    }

    const layersMatch = raw.match(/product-aware matching\s*\(([^)]+)\)/i);
    if (layersMatch) {
      result.rankingLayers = layersMatch[1].split(",").map((s) => s.trim());
    }

    const keyMatch = raw.match(/Key terms:\s*([^.]+)\.?/i);
    if (keyMatch) {
      result.keyTerms = keyMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const cnMatch = raw.match(/Ranked CN\s+([\d\s]+)/i);
    if (cnMatch) result.rankedCnCode = cnMatch[1].trim();

    return result;
  }

  function friendlyFamilyList(families) {
    const labels = families
      .map((f) => FAMILY_LABELS[f] || f.replace(/_/g, " "))
      .filter(Boolean);
    if (!labels.length) return "";
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  }

  function buildSimpleExplanation(suggestion, response) {
    const explanation = suggestion?.match_explanation || "";
    const parsed = parseMatchExplanation(explanation);

    if (/user-provided/i.test(explanation) || response?.user_provided) {
      return "This code was provided by you and verified against the EU Combined Nomenclature index.";
    }

    if (/Matched EU nomenclature/i.test(explanation)) {
      return "Suggested because your product description matches terms in the official EU goods description for this category.";
    }

    const familyText = friendlyFamilyList(parsed.families);
    if (familyText) {
      const brandPart =
        parsed.brands.length > 0
          ? ` (brand: ${parsed.brands.map((b) => b.replace(/\+/g, " + ")).join(", ")})`
          : "";
      return `Suggested because your description describes ${familyText}${brandPart}, which aligns with the EU Combined Nomenclature category for this type of product.`;
    }

    if (parsed.vehicleTypes.length) {
      const vt = friendlyFamilyList(parsed.vehicleTypes);
      return `Suggested because your description indicates ${vt || "a motor vehicle"}, matching EU nomenclature for vehicles.`;
    }

    if (parsed.rankingLayers.length) {
      return "Suggested because words in your product description closely match the official EU Combined Nomenclature text for this code.";
    }

    return "Suggested based on similarity between your product description and the official EU Combined Nomenclature entry.";
  }

  function formatSourceLabel(source, labels) {
    const map = labels || {
      "eu-cn-index": "EU CN index",
      "user-provided": "User provided",
      "user-provided-unverified": "User provided (unverified)",
    };
    if (!source) return "";
    return map[source] || source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderConfidenceBadge(confidence, options) {
    const prefix = options?.classPrefix || "cn-confidence-badge";
    const pct = Math.round((confidence ?? 0) * 100);
    return `<div class="${prefix} ${confidenceLevelClass(confidence, prefix)}" aria-label="Confidence ${pct} percent">
      <span class="${prefix}-value">${pct}%</span>
      <span class="${prefix}-label">match confidence</span>
    </div>`;
  }

  function displayDescription(suggestion) {
    return (
      suggestion.combined_description ||
      suggestion.heading_title ||
      suggestion.description ||
      ""
    );
  }

  function renderHierarchyMeta(suggestion) {
    const chapterCode = suggestion.chapter_code || "—";
    const headingCode = suggestion.heading_code || "—";
    const cn8 = suggestion.cn_code || "—";
    const pct = Math.round((suggestion.confidence_level ?? 0) * 100);
    return `
      <dl class="cn-hierarchy-meta">
        <div class="cn-hierarchy-meta-row">
          <dt>Chapter</dt>
          <dd><span class="cn-meta-code">${escapeHtml(chapterCode)}</span>${suggestion.chapter_title ? `<span class="cn-meta-text">${escapeHtml(suggestion.chapter_title)}</span>` : ""}</dd>
        </div>
        <div class="cn-hierarchy-meta-row">
          <dt>Heading</dt>
          <dd><span class="cn-meta-code">${escapeHtml(headingCode)}</span>${suggestion.heading_title ? `<span class="cn-meta-text">${escapeHtml(suggestion.heading_title)}</span>` : ""}</dd>
        </div>
        <div class="cn-hierarchy-meta-row">
          <dt>CN8 code</dt>
          <dd><span class="cn-meta-code">${escapeHtml(cn8)}</span></dd>
        </div>
        <div class="cn-hierarchy-meta-row">
          <dt>Confidence</dt>
          <dd><span class="cn-meta-confidence ${confidenceLevelClass(suggestion.confidence_level, "cn-meta-confidence")}">${pct}%</span></dd>
        </div>
      </dl>`;
  }

  function renderHierarchyCollapsible(suggestion) {
    const levels = suggestion.hierarchy_levels || [];
    if (!levels.length && !suggestion.chapter_title) {
      return "";
    }
    const levelLabel = { chapter: "Chapter", heading: "Heading", cn8: "CN", path: "Level" };
    const rows = levels
      .map((level) => {
        const label = levelLabel[level.level] || "Level";
        const codePart = level.code
          ? `<span class="cn-hier-code">${escapeHtml(level.code)}</span>`
          : "";
        return `<li class="cn-hier-row cn-hier-row--${escapeHtml(level.level)}">
          <span class="cn-hier-label">${escapeHtml(label)}</span>
          ${codePart}
          <span class="cn-hier-desc">${escapeHtml(level.description)}</span>
        </li>`;
      })
      .join("");

    return `
      <details class="cn-hierarchy-panel">
        <summary>Show Full CN Hierarchy</summary>
        <ol class="cn-hierarchy-list">${rows}</ol>
      </details>`;
  }

  function renderPrimaryCard(suggestion, response, options) {
    const radioName = options.radioName || "cnSuggestion";
    const selected = options.selectedCn === suggestion.cn_code;
    const simpleWhy = buildSimpleExplanation(suggestion, response);
    const combined = displayDescription(suggestion);
    const terminal =
      suggestion.description &&
      combined &&
      suggestion.description.toLowerCase() !== combined.toLowerCase()
        ? `<p class="cn-terminal-desc"><span class="cn-terminal-label">CN8 wording:</span> ${escapeHtml(suggestion.description)}</p>`
        : "";

    return `
      <article class="cn-primary-card ${selected ? "is-selected" : ""}" data-cn="${escapeHtml(suggestion.cn_code)}">
        <p class="cn-primary-label">Recommended match</p>
        <h3 class="cn-code-display">${escapeHtml(suggestion.cn_code)}</h3>
        <p class="cn-combined-desc">${escapeHtml(combined)}</p>
        ${terminal}
        ${renderHierarchyMeta(suggestion)}
        ${renderHierarchyCollapsible(suggestion)}
        <p class="cn-simple-why">${escapeHtml(simpleWhy)}</p>
        <label class="cn-select-label">
          <input type="radio" name="${escapeHtml(radioName)}" value="${escapeHtml(suggestion.cn_code)}" ${selected ? "checked" : ""}>
          <span>Use this CN code</span>
        </label>
      </article>`;
  }

  function renderAlternateItem(suggestion, response, options) {
    const radioName = options.radioName || "cnSuggestion";
    const selected = options.selectedCn === suggestion.cn_code;
    const pct = Math.round((suggestion.confidence_level ?? 0) * 100);
    const combined = displayDescription(suggestion);

    return `
      <li class="cn-alt-item ${selected ? "is-selected" : ""}" data-cn="${escapeHtml(suggestion.cn_code)}">
        <label class="cn-alt-label">
          <input type="radio" name="${escapeHtml(radioName)}" value="${escapeHtml(suggestion.cn_code)}" ${selected ? "checked" : ""}>
          <span class="cn-alt-confidence ${confidenceLevelClass(suggestion.confidence_level, "cn-alt-confidence")}">${pct}%</span>
          <span class="cn-alt-body">
            <strong class="cn-alt-code">${escapeHtml(suggestion.cn_code)}</strong>
            <span class="cn-alt-desc">${escapeHtml(combined)}</span>
            ${renderHierarchyMeta(suggestion)}
            ${renderHierarchyCollapsible(suggestion)}
          </span>
        </label>
      </li>`;
  }

  function renderTechnicalAnalysis(response, suggestion) {
    const parsed = parseMatchExplanation(suggestion?.match_explanation || "");
    const keywords = (suggestion?.matched_keywords || []).join(", ") || "—";
    const original = response.original_description || response.product_description || "—";
    const translated = response.translated_description || "—";
    const lang = response.detected_language_name || response.detected_language || "—";
    const langMethod = response.language_detection_method || "—";
    const langConfidence =
      response.language_detection_confidence != null
        ? `${Math.round(response.language_detection_confidence * 100)}%`
        : "—";
    const engine = response.translation_engine_display || response.translation_engine || "—";

    const entitiesBlock = parsed.entitiesLine
      ? `<li><strong>Detected entities:</strong> ${escapeHtml(parsed.entitiesLine)}</li>`
      : "";
    const modelsBlock =
      parsed.models.length > 0
        ? `<li><strong>Model codes excluded from search:</strong> ${escapeHtml(parsed.models.join(", "))}</li>`
        : "";
    const layersBlock =
      parsed.rankingLayers.length > 0
        ? `<li><strong>Ranking layers:</strong> ${escapeHtml(parsed.rankingLayers.join(", "))}</li>`
        : "";
    const keyTermsBlock =
      parsed.keyTerms.length > 0
        ? `<li><strong>Key terms:</strong> ${escapeHtml(parsed.keyTerms.join(", "))}</li>`
        : "";

    const showTranslation =
      response.detected_language && response.detected_language !== "en" && original !== translated;

    return `
      <details class="cn-technical-analysis">
        <summary>Technical Analysis</summary>
        <div class="cn-technical-body">
          <ul class="cn-technical-list">
            ${entitiesBlock}
            ${modelsBlock}
            <li><strong>Matched keywords:</strong> ${escapeHtml(keywords)}</li>
            <li><strong>Language detected:</strong> ${escapeHtml(lang)} (${escapeHtml(langMethod)}, confidence ${escapeHtml(langConfidence)})</li>
            ${showTranslation ? `<li><strong>Original description:</strong> ${escapeHtml(original)}</li>` : ""}
            ${showTranslation ? `<li><strong>Translated description:</strong> ${escapeHtml(translated)}</li>` : ""}
            <li><strong>Translation engine:</strong> ${escapeHtml(engine)}</li>
            ${layersBlock}
            ${keyTermsBlock}
            <li><strong>Ranking explanation:</strong> ${escapeHtml(parsed.raw || "—")}</li>
            <li><strong>Data source:</strong> ${escapeHtml(formatSourceLabel(response.source))}</li>
          </ul>
        </div>
      </details>`;
  }

  function renderClassificationResults(response, options) {
    const opts = options || {};
    const suggestions = response.suggestions || [];
    if (!suggestions.length) {
      return { html: "", bind: function () {} };
    }

    const primary = suggestions[0];
    const alternates = suggestions.slice(1);
    const selectedCn = opts.selectedCn || (opts.autoSelectFirst === false ? "" : "");
    const preselectFirst = opts.autoSelectFirst !== false && response.classification_state === "SUGGEST";
    const selectedSuggestion =
      suggestions.find((item) => item.cn_code === selectedCn) || primary;
    const cardOpts = {
      radioName: opts.radioName || "cnSuggestion",
      selectedCn: selectedCn || (preselectFirst ? primary.cn_code : ""),
      classPrefix: opts.classPrefix,
    };

    const riskWarning =
      selectedSuggestion.confidence_level != null && selectedSuggestion.confidence_level < 0.7
        ? `<p class="classification-risk-warning" role="alert">High risk of misclassification. Verify this CN code with customs or a trade specialist before use.</p>`
        : "";

    const alternatesHtml =
      alternates.length > 0
        ? `<section class="cn-alternates" aria-labelledby="cn-alternates-heading">
            <h4 id="cn-alternates-heading" class="cn-alternates-title">Other Possible Matches</h4>
            <ul class="cn-alt-list">${alternates.map((item) => renderAlternateItem(item, response, cardOpts)).join("")}</ul>
          </section>`
        : "";

    const html = `
      <div class="cn-results-ux" role="region" aria-label="CN classification suggestions">
        ${renderPrimaryCard(primary, response, cardOpts)}
        ${alternatesHtml}
        ${renderTechnicalAnalysis(response, selectedSuggestion)}
        ${riskWarning}
        <p class="cn-results-hint">Select the code that best describes your product, then continue.</p>
      </div>`;

    function bind(container, onSelect) {
      if (!container) return;
      container.querySelectorAll(`input[name="${cardOpts.radioName}"]`).forEach((input) => {
        input.addEventListener("change", () => {
          if (!input.checked) return;
          const cnCode = input.value;
          container.querySelectorAll("[data-cn]").forEach((el) => {
            el.classList.toggle("is-selected", el.dataset.cn === cnCode);
          });
          const suggestion = suggestions.find((item) => item.cn_code === cnCode);
          if (onSelect) onSelect(cnCode, suggestion);
        });
      });
    }

    return { html, bind, primary };
  }

  function renderSelectedSummary(result, response, suggestion) {
    const item = suggestion || {
      cn_code: result.cn_code,
      description: result.description,
      confidence_level: result.confidence_level,
      match_explanation: result.match_explanation,
      matched_keywords: result.matched_keywords || [],
    };

    const simpleWhy = buildSimpleExplanation(item, response || {});
    const riskWarning =
      result.confidence_level != null && result.confidence_level < 0.7
        ? `<p class="classification-risk-warning" role="alert">High risk of misclassification. Verify this CN code before customs use.</p>`
        : "";

    const combined =
      item.combined_description || item.heading_title || result.description || "";
    const terminal =
      item.description &&
      combined &&
      item.description.toLowerCase() !== combined.toLowerCase()
        ? `<p class="cn-terminal-desc"><span class="cn-terminal-label">CN8 wording:</span> ${escapeHtml(item.description)}</p>`
        : "";

    return `
      <div class="cn-results-ux cn-results-ux--summary" role="region" aria-label="Selected CN classification">
        <article class="cn-primary-card is-selected">
          <p class="cn-primary-label">Selected classification</p>
          <h3 class="cn-code-display">${escapeHtml(result.cn_code)}</h3>
          ${combined ? `<p class="cn-combined-desc">${escapeHtml(combined)}</p>` : ""}
          ${terminal}
          ${renderHierarchyMeta(item)}
          ${renderHierarchyCollapsible(item)}
          <p class="cn-simple-why">${escapeHtml(simpleWhy)}</p>
        </article>
        ${response && suggestion ? renderTechnicalAnalysis(response, item) : ""}
        ${riskWarning}
        <p class="cn-source-note"><strong>Source:</strong> ${escapeHtml(formatSourceLabel(result.source))}</p>
      </div>`;
  }

  function renderDetectedAttributes(response) {
    const attrs = response.detected_attributes;
    if (!attrs) {
      return "";
    }
    const rows = [];
    if (attrs.gender) rows.push(`<li><strong>Gender:</strong> ${escapeHtml(attrs.gender)}</li>`);
    if (attrs.material) rows.push(`<li><strong>Material:</strong> ${escapeHtml(attrs.material)}</li>`);
    if (attrs.fabric) rows.push(`<li><strong>Fabric:</strong> ${escapeHtml(attrs.fabric)}</li>`);
    if (attrs.construction) {
      rows.push(`<li><strong>Construction:</strong> ${escapeHtml(attrs.construction)}</li>`);
    }
    if (!rows.length) {
      return "";
    }
    const auto = (response.auto_answered_questions || []).length
      ? `<p class="cn-results-hint">Auto-filled from product understanding: ${escapeHtml(
          response.auto_answered_questions.join(", ")
        )}</p>`
      : "";
    return `<section class="cn-detected-attributes" aria-label="Detected product attributes">
      <h4 class="cn-alternates-title">Detected</h4>
      <ul class="cn-technical-list">${rows.join("")}</ul>
      ${auto}
    </section>`;
  }

  global.ClassificationUI = {
    escapeHtml,
    parseMatchExplanation,
    buildSimpleExplanation,
    displayDescription,
    renderHierarchyMeta,
    renderHierarchyCollapsible,
    renderClassificationResults,
    renderSelectedSummary,
    renderDetectedAttributes,
    confidenceLevelClass,
    formatSourceLabel,
  };
})(typeof window !== "undefined" ? window : global);
