const state = {
  step: 1,
  classification: null,
  classifyResponse: null,
  selectedCnCode: null,
  disambiguationAnswers: {},
  documents: null,
  duties: null,
  vat: null,
  landed: null,
  transport: null,
};

const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

const SOURCE_LABELS = {
  "eu-cn-nomenclature-search": "EU CN Nomenclature Search",
  "user-provided": "User Provided",
  "user-provided-unverified": "User Provided (unverified in index)",
  "sample-taric-structure": "Sample Tariff Structure",
  "route-intra-eu": "Route rules (intra-EU)",
  "sample-exportgateway-freight-logic": "Sample Freight Logic",
};

function byId(id) {
  return document.getElementById(id);
}

function value(id) {
  return byId(id).value.trim();
}

function numberValue(id) {
  return Number(byId(id).value || 0);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function cnDigits(cnCode) {
  return String(cnCode ?? "").replace(/\D/g, "");
}

function isSampleDutiesSource(source) {
  const value = String(source ?? "").toLowerCase();
  return value.includes("sample") && !value.includes("route");
}

function formatApiError(detail) {
  if (!detail) return "Request failed.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join(" ");
  }
  return String(detail);
}

function isValidCn8(code) {
  return cnDigits(code).length >= 8;
}

function buildClassificationState(cnCode, response, suggestion) {
  return {
    cn_code: cnCode,
    product_description: response.product_description,
    confidence_level: suggestion?.confidence_level ?? response.confidence_level ?? null,
    source: suggestion ? response.source : response.source,
    description: suggestion?.description ?? null,
    combined_description: suggestion?.combined_description ?? null,
    chapter_code: suggestion?.chapter_code ?? null,
    chapter_title: suggestion?.chapter_title ?? null,
    heading_code: suggestion?.heading_code ?? null,
    heading_title: suggestion?.heading_title ?? null,
    hierarchy_levels: suggestion?.hierarchy_levels ?? [],
    match_explanation: suggestion?.match_explanation ?? null,
    matched_keywords: suggestion?.matched_keywords ?? [],
  };
}

function formatSourceLabel(source) {
  if (!source) return "";
  return SOURCE_LABELS[source] || source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderClassificationPanel(container, result) {
  const suggestion = state.classifyResponse?.suggestions?.find((item) => item.cn_code === result.cn_code);
  container.classList.remove("d-none");
  container.innerHTML = ClassificationUI.renderSelectedSummary(
    result,
    state.classifyResponse,
    suggestion
  );
}

function renderClassificationSuggestions(response) {
  const container = byId("classificationResult");
  const manualNotice = byId("classificationManualNotice");
  const continueBtn = byId("classifyNextBtn");
  container.classList.remove("d-none");

  const phaseStatus = renderPhaseAStatus(response);
  const autoSelect =
    response.classification_state === "SUGGEST" && response.suggestions.length > 0;

  if (response.suggestions.length > 0) {
    manualNotice.classList.add("d-none");
    const view = ClassificationUI.renderClassificationResults(response, {
      radioName: "cnSuggestion",
      selectedCn: state.selectedCnCode || "",
      autoSelectFirst: autoSelect,
    });
    container.innerHTML = phaseStatus + view.html;
    view.bind(container, (cnCode) => selectCnSuggestion(response, cnCode));
    if (autoSelect && !state.selectedCnCode) {
      selectCnSuggestion(response, response.suggestions[0].cn_code);
    }
    continueBtn.textContent = "Continue to shipment";
    continueBtn.disabled = !state.selectedCnCode;
    return;
  }

  if (response.classification_state === "DISAMBIGUATE") {
    manualNotice.classList.add("d-none");
    container.innerHTML = phaseStatus + renderDisambiguationBlock(response);
    const applyBtn = byId("applyDisambiguationBtn");
    if (applyBtn) {
      applyBtn.addEventListener("click", () =>
        applyDisambiguationAndReclassify().catch((err) => showToast(err.message))
      );
    }
    continueBtn.textContent = "Search CN suggestions";
    continueBtn.disabled = false;
    return;
  }

  manualNotice.classList.remove("d-none");
  if (response.requires_assistance) {
    manualNotice.textContent =
      "No reliable CN match was found in the nomenclature index. Enter your CN code manually or use Request Assistance on the results step.";
  } else if (response.user_provided) {
    manualNotice.textContent =
      "Your CN code was not found in the nomenclature index. Verify the code before continuing or choose another.";
  } else {
    manualNotice.textContent = "Enter a valid 8-digit CN code manually to continue.";
  }
  container.innerHTML = `<p class="source-label"><strong>Source:</strong> ${escapeHtml(formatSourceLabel(response.source))}</p>`;
  continueBtn.textContent = "Continue to shipment";
  continueBtn.disabled = !isValidCn8(value("cnCode"));
}

function selectCnSuggestion(response, cnCode) {
  const suggestion = response.suggestions.find((item) => item.cn_code === cnCode);
  state.selectedCnCode = cnCode;
  state.classification = buildClassificationState(cnCode, response, suggestion);
  byId("cnCode").value = cnCode;
  byId("classifyNextBtn").disabled = false;

  const container = byId("classificationResult");
  const view = ClassificationUI.renderClassificationResults(response, {
    radioName: "cnSuggestion",
    selectedCn: cnCode,
  });
  container.innerHTML = view.html;
  view.bind(container, (code) => selectCnSuggestion(response, code));
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed." }));
    throw new Error(formatApiError(error.detail));
  }

  return response.json();
}

function showToast(message) {
  const toastEl = byId("appToast");
  toastEl.querySelector(".toast-body").textContent = message;
  bootstrap.Toast.getOrCreateInstance(toastEl).show();
}

function setStep(step) {
  state.step = step;
  document.querySelectorAll(".wizard-step").forEach((section) => {
    section.classList.toggle("active", Number(section.dataset.step) === step);
  });
  document.querySelectorAll(".step-pill").forEach((pill) => {
    pill.classList.toggle("active", Number(pill.dataset.stepTarget) === step);
  });
  scrollToWizard();
}

function scrollToWizard() {
  const wizard = document.getElementById("complianceWizard");
  if (!wizard) return;
  wizard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function productPayload() {
  const payload = {
    product_description: value("productDescription"),
    cn_code: value("cnCode") || null,
  };
  if (Object.keys(state.disambiguationAnswers).length > 0) {
    payload.disambiguation = { ...state.disambiguationAnswers };
  }
  return payload;
}

function renderDisambiguationBlock(response) {
  if (!response.disambiguation_questions?.length) {
    return "";
  }
  const blocks = response.disambiguation_questions
    .map((q) => {
      const options = (q.options || [])
        .map(
          (o) =>
            `<label class="cn-disambig-option"><input type="radio" name="disambig_${escapeHtml(q.id)}" value="${escapeHtml(o.id)}"> ${escapeHtml(o.label)}</label>`
        )
        .join("");
      return `<div class="cn-disambig-question" data-question-id="${escapeHtml(q.id)}">
        <p class="cn-disambig-prompt"><strong>${escapeHtml(q.prompt)}</strong></p>
        <div class="cn-disambig-options">${options}</div>
      </div>`;
    })
    .join("");
  return `<section class="cn-disambiguation-panel" aria-label="Additional product details">
    <h4 class="cn-alternates-title">More detail needed</h4>
    <p class="cn-results-hint">Answer the question below, then search again for CN suggestions.</p>
    ${blocks}
    <button type="button" class="btn btn-outline-primary btn-sm mt-2" id="applyDisambiguationBtn">Apply answers and search again</button>
  </section>`;
}

function renderPhaseAStatus(response) {
  const parts = [];
  if (typeof ClassificationUI.renderDetectedAttributes === "function") {
    parts.push(ClassificationUI.renderDetectedAttributes(response));
  }
  if (response.data_quality_score != null) {
    parts.push(`<p class="cn-results-hint"><strong>Data quality:</strong> ${Math.round(response.data_quality_score * 100)}%</p>`);
  }
  if (response.classification_state) {
    parts.push(`<p class="cn-results-hint"><strong>Status:</strong> ${escapeHtml(response.classification_state)}</p>`);
  }
  if (response.requires_expert_review) {
    parts.push(
      `<p class="classification-risk-warning">Expert review recommended before filing this CN code with customs.</p>`
    );
  }
  if (response.classification_run_id) {
    parts.push(`<p class="cn-source-note"><strong>Audit ID:</strong> ${escapeHtml(response.classification_run_id)}</p>`);
  }
  return parts.join("");
}

async function applyDisambiguationAndReclassify() {
  state.disambiguationAnswers = {};
  document.querySelectorAll(".cn-disambig-question").forEach((block) => {
    const qid = block.dataset.questionId;
    const selected = block.querySelector(`input[name="disambig_${qid}"]:checked`);
    if (selected) {
      state.disambiguationAnswers[qid] = selected.value;
    }
  });
  state.classifyResponse = null;
  state.selectedCnCode = null;
  state.classification = null;
  const result = await postJson("/classify-product", productPayload());
  state.classifyResponse = result;
  renderClassificationSuggestions(result);
}

function shipmentPayload() {
  return {
    origin_country: value("originCountry"),
    destination_country: value("destinationCountry"),
    goods_value_eur: numberValue("goodsValue"),
    net_weight_kg: numberValue("netWeight"),
    gross_weight_kg: numberValue("grossWeight"),
    incoterm: value("incoterm"),
    transport_mode: value("transportMode"),
  };
}

function validateVisibleStep() {
  const active = document.querySelector(".wizard-step.active");
  const fields = active.querySelectorAll("input, textarea, select");
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

async function classifyAndContinue() {
  if (!validateVisibleStep()) return;

  if (state.selectedCnCode && state.classification) {
    setStep(2);
    return;
  }

  if (state.classifyResponse) {
    if (ensureClassificationSelected()) setStep(2);
    return;
  }

  const result = await postJson("/classify-product", productPayload());
  state.classifyResponse = result;

  if (result.user_provided && result.suggestions.length === 1) {
    const suggestion = result.suggestions[0];
    state.selectedCnCode = suggestion.cn_code;
    state.classification = buildClassificationState(suggestion.cn_code, result, suggestion);
    byId("cnCode").value = suggestion.cn_code;
    renderClassificationPanel(byId("classificationResult"), state.classification);
    byId("classificationManualNotice").classList.add("d-none");
    byId("classifyNextBtn").textContent = "Continue to shipment";
    byId("classifyNextBtn").disabled = false;
    setStep(2);
    return;
  }

  renderClassificationSuggestions(result);

  if (result.user_provided && result.requires_manual_entry) {
    byId("cnCode").addEventListener(
      "input",
      () => {
        const code = value("cnCode");
        byId("classifyNextBtn").disabled = !isValidCn8(code);
        if (isValidCn8(code)) {
          state.selectedCnCode = code;
          state.classification = buildClassificationState(code, result, null);
        }
      },
      { once: false }
    );
  }
}

function ensureClassificationSelected() {
  if (state.classification?.cn_code) return true;
  const manual = value("cnCode");
  if (isValidCn8(manual) && state.classifyResponse) {
    state.selectedCnCode = manual;
    state.classification = buildClassificationState(manual, state.classifyResponse, null);
    byId("cnCode").value = manual;
    return true;
  }
  showToast("Select a CN suggestion or enter a valid 8-digit CN code before continuing.");
  return false;
}

function renderTransportResult(container, result) {
  const sourceLabel = formatSourceLabel(result.method);
  container.classList.remove("d-none");
  container.innerHTML = `
    <p><strong>Estimated transport cost:</strong> ${escapeHtml(money.format(result.estimated_cost_eur))}</p>
    <p class="source-label"><strong>Source:</strong> ${escapeHtml(sourceLabel)}</p>
    <div class="small text-muted mt-1">${result.assumptions.map((note) => escapeHtml(note)).join(" ")}</div>`;
}

async function calculateTransport() {
  const payload = {
    pickup_postal_code: value("pickupPostal"),
    delivery_postal_code: value("deliveryPostal"),
    weight_kg: numberValue("freightWeight"),
    loading_meters: numberValue("loadingMeters"),
    vehicle_type: value("vehicleType"),
    mode: value("transportMode"),
  };
  const result = await postJson("/calculate-transport", payload);
  state.transport = result;
  byId("transportCost").value = result.estimated_cost_eur.toFixed(2);
  renderTransportResult(byId("transportResult"), result);
  bootstrap.Modal.getOrCreateInstance(byId("transportModal")).hide();
}

async function calculateAll() {
  if (!validateVisibleStep()) return;
  if (!ensureClassificationSelected()) return;

  const shipment = shipmentPayload();
  const transportCost = numberValue("transportCost");

  const [documents, duties] = await Promise.all([
    postJson("/documents", {
      origin_country: shipment.origin_country,
      destination_country: shipment.destination_country,
      shipment_type: "Commercial goods",
      incoterm: shipment.incoterm,
      transport_mode: shipment.transport_mode,
    }),
    postJson("/duties", {
      cn_code: state.classification.cn_code,
      origin_country: shipment.origin_country,
      destination_country: shipment.destination_country,
      goods_value_eur: shipment.goods_value_eur,
    }),
  ]);

  const vatPayload = {
    goods_value_eur: shipment.goods_value_eur,
    transport_cost_eur: transportCost,
    duty_rate_percent: duties.duty_rate_percent,
    origin_country: shipment.origin_country,
    destination_country: shipment.destination_country,
  };

  const [vat, landed] = await Promise.all([
    postJson("/vat", vatPayload),
    postJson("/landed-cost", vatPayload),
  ]);

  state.documents = documents;
  state.duties = duties;
  state.vat = vat;
  state.landed = landed;
  renderResults();
  setStep(4);
  if (typeof window.egwTrack === "function") {
    window.egwTrack("wizard_completed", { tool_name: "export_compliance_wizard" });
  }
}

function renderDutiesTable() {
  const duties = state.duties;
  const sourceEl = byId("dutiesSourceLabel");
  const sourceLabel = formatSourceLabel(duties.source);
  sourceEl.textContent = sourceLabel ? `Source: ${sourceLabel}` : "";
  sourceEl.classList.toggle("d-none", !sourceLabel);

  let measuresHtml;
  if (duties.source === "route-intra-eu") {
    measuresHtml = `
      <tr>
        <td colspan="3">${escapeHtml(duties.route_message || "No customs duty applies for this intra-EU route.")}</td>
      </tr>`;
  } else if (isSampleDutiesSource(duties.source)) {
    measuresHtml = `
      <tr>
        <td colspan="3" class="measure-sample-notice">
          Sample customs measures for demonstration purposes only.
        </td>
      </tr>`;
  } else {
    const rows = [
      ...duties.measures.map((item) => ["Measure", item]),
      ...duties.restrictions.map((item) => ["Restriction", item]),
      ...duties.certificates.map((item) => ["Certificate", item]),
    ];
    measuresHtml = rows
      .map(
        ([type, item]) =>
          `<tr><td>${escapeHtml(type)}</td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.description)}</td></tr>`
      )
      .join("");
  }

  byId("dutiesTable").innerHTML = `
    <tr><td>Duty rate</td><td colspan="2"><strong>${duties.duty_rate_percent.toFixed(2)}%</strong></td></tr>
    ${measuresHtml}`;
}

function renderResults() {
  const routeMessage = state.duties?.route_message || state.vat?.route_message;
  const routeNotice = byId("routeNotice");
  if (routeMessage) {
    routeNotice.textContent = routeMessage;
    routeNotice.classList.remove("d-none");
  } else {
    routeNotice.classList.add("d-none");
  }

  byId("landedCards").innerHTML = [
    ["Goods Value", state.landed.goods_value_eur],
    ["Transport Cost", state.landed.transport_cost_eur],
    ["Customs Duty", state.landed.customs_duty_eur],
    ["Import VAT", state.landed.import_vat_eur],
    ["Total Landed Cost", state.landed.total_landed_cost_eur, "total"],
  ]
    .map(
      ([label, amount, extra]) => `
    <article class="summary-card ${extra || ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(money.format(amount))}</strong>
    </article>`
    )
    .join("");

  byId("requiredDocs").innerHTML = state.documents.required_documents
    .map((doc) => `<li>${escapeHtml(doc)}</li>`)
    .join("");
  byId("optionalDocs").innerHTML = state.documents.optional_documents
    .map((doc) => `<li>${escapeHtml(doc)}</li>`)
    .join("");
  byId("docNotes").innerHTML = state.documents.additional_notes
    .map((note) => `<p>${escapeHtml(note)}</p>`)
    .join("");

  renderDutiesTable();

  const vatSourceEl = byId("vatRateSourceLabel");
  if (state.vat.vat_rate_source) {
    vatSourceEl.textContent = `VAT Rate Source: ${state.vat.vat_rate_source}`;
    vatSourceEl.classList.remove("d-none");
  } else {
    vatSourceEl.classList.add("d-none");
  }
  const vatWarningEl = byId("vatWarningLabel");
  if (state.vat.warning) {
    vatWarningEl.textContent = state.vat.warning;
    vatWarningEl.classList.remove("d-none");
  } else {
    vatWarningEl.classList.add("d-none");
  }

  const importVatLabel =
    state.vat.import_vat_applicable && state.vat.vat_rate_percent != null
      ? `Import VAT (${state.vat.vat_rate_percent.toFixed(2)}%)`
      : "Import VAT (not applicable for this route)";

  byId("vatTable").innerHTML = [
    ["Goods Value", state.vat.goods_value_eur],
    ["Transport Cost", state.vat.transport_cost_eur],
    ["Customs Duty", state.vat.duty_amount_eur],
    ["Customs Value", state.vat.customs_value_eur],
    [importVatLabel, state.vat.vat_amount_eur],
    ["Total Import Charges", state.vat.total_import_charges_eur],
  ]
    .map(
      ([label, amount]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(money.format(amount))}</td></tr>`
    )
    .join("");

  const classificationPanel = byId("resultsClassificationSummary");
  if (classificationPanel && state.classification) {
    renderClassificationPanel(classificationPanel, state.classification);
  }

  const transportSummary = byId("resultsTransportSource");
  if (transportSummary) {
    if (state.transport?.method) {
      transportSummary.textContent = `Source: ${formatSourceLabel(state.transport.method)}`;
      transportSummary.classList.remove("d-none");
    } else {
      transportSummary.classList.add("d-none");
    }
  }

  fillLeadForm();
}

function buildWizardSummary() {
  if (!state.landed || !state.classification) return "";
  const shipment = shipmentPayload();
  return [
    `Goods value: ${money.format(shipment.goods_value_eur)}`,
    `Net / gross weight: ${shipment.net_weight_kg} kg / ${shipment.gross_weight_kg} kg`,
    `Incoterm: ${shipment.incoterm}`,
    `Transport mode: ${shipment.transport_mode}`,
    `Transport cost: ${money.format(state.landed.transport_cost_eur)}`,
    `Transport source: ${state.transport ? formatSourceLabel(state.transport.method) : "Manual entry"}`,
    state.classification.confidence_level != null
      ? `Classification confidence: ${(state.classification.confidence_level * 100).toFixed(0)}%`
      : "Classification confidence: not scored (manual or unverified code)",
    `Classification source: ${formatSourceLabel(state.classification.source)}`,
    `Duty rate: ${state.duties.duty_rate_percent.toFixed(2)}%`,
    `Duty source: ${formatSourceLabel(state.duties.source)}`,
    `Customs duty: ${money.format(state.landed.customs_duty_eur)}`,
    state.vat.vat_rate_percent != null
      ? `Import VAT (${state.vat.vat_rate_percent.toFixed(2)}%): ${money.format(state.landed.import_vat_eur)}`
      : `Import VAT: ${money.format(state.landed.import_vat_eur)} (route or rate not applicable)`,
    `Total landed cost: ${money.format(state.landed.total_landed_cost_eur)}`,
    "",
    "Indicative estimates only — verify before customs or commercial use.",
  ].join("\n");
}

function fillLeadForm() {
  if (!state.landed || !state.classification) return;
  const shipment = shipmentPayload();
  byId("leadOriginCountry").value = shipment.origin_country;
  byId("leadDestinationCountry").value = shipment.destination_country;
  byId("leadProductDescription").value = value("productDescription");
  byId("leadCnCode").value = state.classification.cn_code;
  byId("leadWizardSummary").value = buildWizardSummary();
}

function leadPayload() {
  return {
    company_name: value("companyName"),
    contact_name: value("contactName"),
    email: value("contactEmail"),
    origin_country: value("leadOriginCountry"),
    destination_country: value("leadDestinationCountry"),
    product_description: value("leadProductDescription"),
    cn_code: value("leadCnCode"),
    wizard_summary: value("leadWizardSummary"),
  };
}

function pdfPayload() {
  const shipment = shipmentPayload();
  const selected = state.classifyResponse?.suggestions?.find(
    (item) => item.cn_code === state.classification.cn_code
  );
  const alternates = (state.classifyResponse?.suggestions || [])
    .filter((item) => item.cn_code !== state.classification.cn_code)
    .slice(0, 4)
    .map((item) => ({
      cn_code: item.cn_code,
      combined_description: item.combined_description || item.heading_title || item.description,
      description: item.description,
      confidence_level: item.confidence_level,
      chapter_code: item.chapter_code,
      heading_code: item.heading_code,
    }));
  return {
    origin_country: shipment.origin_country,
    destination_country: shipment.destination_country,
    product_description: value("productDescription"),
    cn_code: state.classification.cn_code,
    required_documents: state.documents.required_documents,
    duty_rate_percent: state.duties.duty_rate_percent,
    duty_amount_eur: state.vat.duty_amount_eur,
    vat_rate_percent: state.vat.vat_rate_percent ?? 0,
    vat_amount_eur: state.vat.vat_amount_eur,
    transport_cost_eur: state.landed.transport_cost_eur,
    total_landed_cost_eur: state.landed.total_landed_cost_eur,
    classification_confidence: state.classification.confidence_level,
    classification_source: state.classification.source,
    classification_combined_description:
      state.classification.combined_description ||
      selected?.combined_description ||
      null,
    classification_chapter_code:
      state.classification.chapter_code || selected?.chapter_code || null,
    classification_chapter_title:
      state.classification.chapter_title || selected?.chapter_title || null,
    classification_heading_code:
      state.classification.heading_code || selected?.heading_code || null,
    classification_heading_title:
      state.classification.heading_title || selected?.heading_title || null,
    classification_cn8_description:
      state.classification.description || selected?.description || null,
    classification_hierarchy_levels:
      state.classification.hierarchy_levels?.length
        ? state.classification.hierarchy_levels
        : selected?.hierarchy_levels || [],
    alternate_classifications: alternates,
    duties_source: state.duties.source,
    transport_source: state.transport?.method ?? null,
    incoterm: shipment.incoterm,
    transport_mode: shipment.transport_mode,
    goods_value_eur: shipment.goods_value_eur,
    net_weight_kg: shipment.net_weight_kg,
    gross_weight_kg: shipment.gross_weight_kg,
    customs_duty_eur: state.landed.customs_duty_eur,
  };
}

async function downloadPdf() {
  if (!state.landed) return;
  const response = await fetch("/generate-pdf?download=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pdfPayload()),
  });
  if (!response.ok) throw new Error("PDF generation failed.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "export-compliance-report.pdf";
  link.click();
  URL.revokeObjectURL(url);
}

function resetLeadModal() {
  byId("leadFormFields").classList.remove("d-none");
  byId("leadSuccess").classList.add("d-none");
  byId("leadModalFooter").classList.remove("d-none");
  byId("sendLeadBtn").disabled = false;
}

function showLeadSuccess(message) {
  byId("leadFormFields").classList.add("d-none");
  byId("leadSuccess").classList.remove("d-none");
  const successPanel = byId("leadSuccess");
  successPanel.querySelector("p").textContent = message;
  byId("leadModalFooter").classList.add("d-none");
}

async function submitLead() {
  if (!state.landed) {
    showToast("Complete the wizard calculation before submitting a request.");
    return;
  }

  const form = byId("leadFormFields");
  const fields = form.querySelectorAll("input:not([readonly]), textarea:not([readonly])");
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return;
    }
  }

  byId("sendLeadBtn").disabled = true;
  try {
    const response = await postJson("/leads", leadPayload());
    showLeadSuccess(response.message);
    showToast(response.message);
    if (typeof window.egwTrack === "function") {
      window.egwTrack("lead_submitted", { tool_name: "export_compliance_wizard" });
    }
  } finally {
    byId("sendLeadBtn").disabled = false;
  }
}

function openLeadModal() {
  if (!state.landed) {
    showToast("Complete the wizard calculation before requesting assistance.");
    return;
  }
  resetLeadModal();
  fillLeadForm();
  bootstrap.Modal.getOrCreateInstance(byId("leadModal")).show();
}

function restart() {
  state.step = 1;
  state.classification = null;
  state.classifyResponse = null;
  state.selectedCnCode = null;
  state.documents = null;
  state.duties = null;
  state.vat = null;
  state.landed = null;
  state.transport = null;
  byId("classificationResult").classList.add("d-none");
  byId("classificationResult").innerHTML = "";
  byId("transportResult").classList.add("d-none");
  byId("transportResult").innerHTML = "";
  const dutiesSource = byId("dutiesSourceLabel");
  if (dutiesSource) {
    dutiesSource.classList.add("d-none");
    dutiesSource.textContent = "";
  }
  const resultsClassification = byId("resultsClassificationSummary");
  if (resultsClassification) {
    resultsClassification.classList.add("d-none");
    resultsClassification.innerHTML = "";
  }
  byId("classificationManualNotice").classList.add("d-none");
  byId("classifyNextBtn").textContent = "Search CN suggestions";
  byId("classifyNextBtn").disabled = !value("productDescription");
  setStep(1);
}

function bindWizardStartedTracking() {
  const wizard = byId("complianceWizard");
  if (!wizard || typeof window.egwTrackSessionOnce !== "function") return;

  const markStarted = () => {
    window.egwTrackSessionOnce("wizard_started", { tool_name: "export_compliance_wizard" });
  };

  wizard.addEventListener("focusin", markStarted, { once: true });
  wizard.addEventListener(
    "click",
    (event) => {
      if (event.target.closest("input, textarea, select, button")) markStarted();
    },
    { once: true }
  );
}

function bindWizardAssistanceTracking() {
  if (typeof window.egwTrack !== "function") return;

  byId("openLeadBtn")?.addEventListener("click", () => {
    window.egwTrack("wizard_assistance_clicked", {
      tool_name: "export_compliance_wizard",
      assistance_surface: "request_assistance_button",
    });
  });
}

function bindEvents() {
  bindWizardStartedTracking();
  bindWizardAssistanceTracking();

  byId("classifyNextBtn").addEventListener("click", () => classifyAndContinue().catch((error) => showToast(error.message)));
  byId("modalTransportBtn").addEventListener("click", () => calculateTransport().catch((error) => showToast(error.message)));
  byId("calculateAllBtn").addEventListener("click", () => calculateAll().catch((error) => showToast(error.message)));
  byId("pdfBtn").addEventListener("click", () => downloadPdf().catch((error) => showToast(error.message)));
  byId("openLeadBtn").addEventListener("click", openLeadModal);
  byId("sendLeadBtn").addEventListener("click", () => submitLead().catch((error) => showToast(error.message)));
  byId("restartBtn").addEventListener("click", restart);

  document.querySelectorAll("[data-next]").forEach((button) => {
    button.addEventListener("click", () => {
      if (validateVisibleStep()) setStep(Math.min(4, state.step + 1));
    });
  });

  document.querySelectorAll("[data-prev]").forEach((button) => {
    button.addEventListener("click", () => setStep(Math.max(1, state.step - 1)));
  });

  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => setStep(Number(button.dataset.stepTarget)));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  byId("classifyNextBtn").disabled = !value("productDescription");
  byId("cnCode").addEventListener("input", () => {
    if (state.classifyResponse?.requires_manual_entry) {
      byId("classifyNextBtn").disabled = !isValidCn8(value("cnCode"));
    }
  });
});
