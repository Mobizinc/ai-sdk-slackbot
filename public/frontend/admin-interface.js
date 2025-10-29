"use strict";
const configEndpoint = "/api/admin/config";
function assertElement(selector, type) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }
    if (!(element instanceof type)) {
        throw new Error(`Element ${selector} is not of type ${type.name}`);
    }
    return element;
}
function isConfigResponse(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    const record = payload;
    return typeof record.settings === "object" && typeof record.metadata === "object";
}
async function fetchConfig() {
    const response = await fetch(configEndpoint, {
        headers: {
            Accept: "application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to load configuration (${response.status})`);
    }
    const payload = await response.json();
    if (!isConfigResponse(payload)) {
        throw new Error("Unsupported config response shape");
    }
    const { settings, metadata } = payload;
    const descriptors = Object.keys(settings).map((key) => ({
        key: key,
        value: settings[key],
        definition: metadata[key],
    }));
    return descriptors.sort((a, b) => a.definition.group.localeCompare(b.definition.group));
}
function createSettingRow(setting) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = setting.key;
    row.appendChild(nameCell);
    const groupCell = document.createElement("td");
    groupCell.textContent = setting.definition.group;
    row.appendChild(groupCell);
    const valueCell = document.createElement("td");
    valueCell.textContent = formatValue(setting.value);
    row.appendChild(valueCell);
    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = setting.definition.description;
    row.appendChild(descriptionCell);
    return row;
}
function formatValue(value) {
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    if (typeof value === "object" && value !== null) {
        return JSON.stringify(value);
    }
    if (value === undefined || value === null || value === "") {
        return "—";
    }
    return String(value);
}
function renderSettings(settings) {
    const tableBody = assertElement("#configTableBody", HTMLTableSectionElement);
    tableBody.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const setting of settings) {
        const row = createSettingRow(setting);
        fragment.appendChild(row);
    }
    tableBody.appendChild(fragment);
}
function renderError(error) {
    const container = assertElement("#configContainer", HTMLDivElement);
    container.innerHTML = `
    <div class="alert alert-danger" role="alert">
      Failed to load configuration: ${error instanceof Error ? error.message : String(error)}
    </div>
  `;
}
function renderEmpty() {
    const container = assertElement("#configContainer", HTMLDivElement);
    container.innerHTML = `
    <div class="alert alert-warning" role="alert">
      No configuration values found.
    </div>
  `;
}
async function initialize() {
    try {
        const settings = await fetchConfig();
        if (settings.length === 0) {
            renderEmpty();
            return;
        }
        renderSettings(settings);
    }
    catch (error) {
        renderError(error);
    }
}
document.addEventListener("DOMContentLoaded", () => {
    void initialize();
});
