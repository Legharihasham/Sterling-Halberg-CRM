const stages = [
  { id: "outreach_done", label: "Outreach Done", hint: "Message sent" },
  { id: "looks_interested", label: "Looks Interested", hint: "Positive signal" },
  { id: "meeting_scheduled", label: "Meeting Scheduled", hint: "Call booked" },
  { id: "meeting_done", label: "Meeting Done", hint: "Proposal ready" },
  { id: "client_closed", label: "Client Closed", hint: "Won account" }
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const state = {
  clients: [],
  selectedId: null,
  draggingId: null,
  query: "",
  service: "all"
};

const els = {
  board: document.querySelector("#pipelineBoard"),
  search: document.querySelector("#clientSearch"),
  searchContainer: document.querySelector("#search-container"),
  searchSuggestions: document.querySelector("#search-suggestions"),
  topbarTitle: document.querySelector("#topbar-title"),
  btnToggleNotifications: document.querySelector("#btnToggleNotifications"),
  btnSendTestPush: document.querySelector("#btnSendTestPush"),
  notifBadge: document.querySelector("#notif-badge"),
  filters: document.querySelectorAll(".filter"),
  metricUpcoming: document.querySelector("#metricUpcoming"),
  metricDone: document.querySelector("#metricDone"),
  metricClosed: document.querySelector("#metricClosed"),
  metricClosedValue: document.querySelector("#metricClosedValue"),
  metricClosedTcv: document.querySelector("#metricClosedTcv"),
  metricPipeline: document.querySelector("#metricPipeline"),
  metricPipelineWeighted: document.querySelector("#metricPipelineWeighted"),
  nextMeetingText: document.querySelector("#nextMeetingText"),
  profileEmpty: document.querySelector("#profileEmpty"),
  profileForm: document.querySelector("#profileForm"),
  saveStatus: document.querySelector("#saveStatus"),
  newClientButton: document.querySelector("#newClientButton"),
  advanceStageButton: document.querySelector("#advanceStageButton"),
  deleteClientButton: document.querySelector("#deleteClientButton"),
  profilePriority: document.querySelector("#profilePriority"),
  profileMonthly: document.querySelector("#profileMonthly"),
  profileTotal: document.querySelector("#profileTotal"),
  focusStage: document.querySelector("#focusStage"),
  profileStageBadge: document.querySelector("#profileStageBadge"),
  focusCopy: document.querySelector("#focusCopy"),
  upcomingMeetingsList: document.querySelector("#upcoming-meetings-list"),
  notesTimeline: document.querySelector("#notes-timeline"),
  meetingClientSearch: document.querySelector("#meetingClientSearch"),
  meetingClientId: document.querySelector("#meetingClientId"),
  meetingClientSuggestions: document.querySelector("#meetingClientSuggestions"),
  meetingDateTime: document.querySelector("#meetingDateTime"),
  scheduleMeetingForm: document.querySelector("#schedule-meeting-form"),
  scheduleStatus: document.querySelector("#scheduleStatus"),
  meetingsCount: document.querySelector("#meetings-count"),
  meetingsList: document.querySelector("#scheduled-meetings-list"),
  navMeetings: document.querySelector("#nav-meetings"),
  mobileNavMeetings: document.querySelector("#mobile-nav-meetings"),
  viewMeetings: document.querySelector("#view-meetings")
};

const fields = [
  "name",
  "company",
  "email",
  "phone",
  "service",
  "stage",
  "priority",
  "monthlyValue",
  "setupFee",
  "contractMonths",
  "probability",
  "nextMeeting",
  "notes",
  "tasks"
].reduce((acc, id) => {
  acc[id] = document.querySelector(`#${id}`);
  return acc;
}, {});

function parseToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  // If it doesn't have timezone offset, assume it is PKT (+05:00)
  if (!value.includes("Z") && !value.match(/[+-]\d{2}:?\d{2}$/)) {
    const separator = value.includes("T") ? "" : "T";
    return new Date(value.replace(" ", "T") + "+05:00");
  }
  return new Date(value);
}

function formatDate(value) {
  return formatPakistanDate(value);
}

function formatPakistanDate(value) {
  const date = parseToDate(value);
  if (!date || Number.isNaN(date.getTime())) return "No date";
  
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    month: "short",
    day: "numeric",
    hour: value.includes("T") ? "numeric" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined
  }).format(date) + " PKT";
}

function getPakistanTimeParts(isoString) {
  const date = parseToDate(isoString);
  if (!date || Number.isNaN(date.getTime())) return { month: "", day: "", time: "", full: "No date" };

  const formatPart = (options) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      ...options
    }).format(date);
  };

  const month = formatPart({ month: "short" }).toUpperCase();
  const day = formatPart({ day: "numeric" });
  const time = formatPart({ hour: "numeric", minute: "2-digit" });
  const full = formatPart({ weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PKT";

  return { month, day, time, full };
}

function toInputDateTime(value) {
  return toPakistanInputDateTime(value);
}

function toPakistanInputDateTime(value) {
  const date = parseToDate(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  // Shift by +5 hours for Pakistan Time
  const pktTime = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return pktTime.toISOString().slice(0, 16);
}

function fromPakistanInputDateTime(value) {
  if (!value) return "";
  // The value from picker is e.g. "2026-06-08T16:30"
  // Since it represents PKT, we append "+05:00" to parse it as PKT
  const date = new Date(value + "+05:00");
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function totalValue(client) {
  if (!client) return 0;
  const setup = Number(client.setupFee) || 0;
  const monthly = Number(client.monthlyValue) || 0;
  const months = Math.max(1, Number(client.contractMonths) || 1);
  return setup + (monthly * months);
}

function weightedValue(client) {
  if (!client) return 0;
  const tcv = totalValue(client);
  const prob = Math.min(100, Math.max(0, Number(client.probability) >= 0 ? Number(client.probability) : 25));
  return tcv * (prob / 100);
}

function probabilityForStage(stageId, currentProbability = 25) {
  const defaults = {
    outreach_done: 20,
    looks_interested: 45,
    meeting_scheduled: 65,
    meeting_done: 82,
    client_closed: 100
  };
  return defaults[stageId] ?? currentProbability;
}

function priorityForStage(stageId, currentPriority = "Warm") {
  if (stageId === "client_closed") return "Closed";
  if (currentPriority === "Closed") return stageId === "outreach_done" ? "New" : "Hot";
  return currentPriority;
}

function filteredClients() {
  const query = state.query.trim().toLowerCase();
  return state.clients.filter((client) => {
    const serviceMatch = state.service === "all" || client.service === state.service;
    const queryMatch = !query || [client.name, client.company, client.service, client.priority]
      .join(" ")
      .toLowerCase()
      .includes(query);
    return serviceMatch && queryMatch;
  });
}

function renderMetrics() {
  const now = new Date();
  const clientsSource = state.query ? filteredClients() : state.clients;
  const upcoming = clientsSource
    .filter((client) => client.nextMeeting && parseToDate(client.nextMeeting) >= now)
    .sort((a, b) => parseToDate(a.nextMeeting) - parseToDate(b.nextMeeting));
  const done = clientsSource.filter((client) => client.stage === "meeting_done" || client.meetingDoneDate);
  const closed = clientsSource.filter((client) => client.stage === "client_closed");
  
  const pipelineTotal = clientsSource
    .filter((client) => client.stage !== "client_closed")
    .reduce((sum, client) => sum + totalValue(client), 0);

  const pipelineWeighted = clientsSource
    .filter((client) => client.stage !== "client_closed")
    .reduce((sum, client) => sum + weightedValue(client), 0);

  const closedMonthly = clientsSource
    .filter((client) => client.stage === "client_closed")
    .reduce((sum, client) => sum + Number(client.monthlyValue || 0), 0);

  const closedTcv = clientsSource
    .filter((client) => client.stage === "client_closed")
    .reduce((sum, client) => sum + totalValue(client), 0);

  if (els.metricUpcoming) els.metricUpcoming.textContent = upcoming.length;
  if (els.metricDone) els.metricDone.textContent = done.length;
  if (els.metricClosed) els.metricClosed.textContent = closed.length;
  if (els.metricClosedValue) els.metricClosedValue.textContent = money.format(closedMonthly);
  if (els.metricClosedTcv) els.metricClosedTcv.textContent = `Total TCV: ${money.format(closedTcv)}`;
  if (els.metricPipeline) els.metricPipeline.textContent = money.format(pipelineTotal);
  if (els.metricPipelineWeighted) els.metricPipelineWeighted.textContent = `Weighted: ${money.format(pipelineWeighted)}`;
  if (els.nextMeetingText) {
    els.nextMeetingText.textContent = upcoming[0]
      ? `${upcoming[0].name} on ${formatDate(upcoming[0].nextMeeting)}`
      : "No meetings scheduled";
  }

  // Render Upcoming Meetings detailed list in Dashboard
  renderUpcomingMeetingsDetailed(upcoming);
}

function renderUpcomingMeetingsDetailed(upcoming) {
  if (!els.upcomingMeetingsList) return;
  els.upcomingMeetingsList.innerHTML = "";

  if (upcoming.length === 0) {
    els.upcomingMeetingsList.innerHTML = `
      <div class="p-md text-center text-on-surface-variant py-lg text-[12px]">
        No upcoming meetings.
      </div>
    `;
    return;
  }

  upcoming.forEach(client => {
    const parts = getPakistanTimeParts(client.nextMeeting);

    const item = document.createElement("div");
    item.className = "p-md flex items-center gap-md hover:bg-surface-container-low transition-colors group cursor-pointer";
    item.onclick = () => {
      window.location.hash = `#profile?id=${client.id}`;
    };

    item.innerHTML = `
      <div class="flex flex-col items-center justify-center min-w-[50px] h-[50px] bg-surface-container rounded border border-outline-variant">
        <span class="text-on-surface-variant text-[9px] font-bold">${parts.month}</span>
        <span class="font-bold text-[16px] leading-none text-primary">${parts.day}</span>
      </div>
      <div class="flex-1 min-w-0">
        <h4 class="font-bold text-primary group-hover:text-secondary transition-colors truncate text-[13px]">${escapeHtml(client.name)}</h4>
        <p class="text-on-surface-variant text-[11px] truncate mt-0.5">Service: ${escapeHtml(client.service)} • ${parts.time} PKT</p>
      </div>
      <div class="flex -space-x-1 shrink-0">
        <div class="w-6 h-6 rounded-full bg-primary text-on-primary text-[9px] flex items-center justify-center font-bold border border-white uppercase">${escapeHtml(client.name.slice(0,2))}</div>
      </div>
      <button class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors shrink-0">
        <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
      </button>
    `;
    els.upcomingMeetingsList.append(item);
  });
}

function renderMeetingsView() {
  if (!els.meetingsList) return;
  els.meetingsList.innerHTML = "";
  
  // Filter clients with meetings
  const clientsWithMeetings = state.clients.filter(client => client.nextMeeting);
  
  if (els.meetingsCount) {
    els.meetingsCount.textContent = `${clientsWithMeetings.length} scheduled`;
  }
  
  if (clientsWithMeetings.length === 0) {
    els.meetingsList.innerHTML = `
      <div class="p-md text-center text-on-surface-variant py-lg text-[12px]">
        No meetings scheduled yet.
      </div>
    `;
    return;
  }
  
  // Sort meetings chronologically: closest upcoming first
  clientsWithMeetings.sort((a, b) => new Date(a.nextMeeting) - new Date(b.nextMeeting));
  
  clientsWithMeetings.forEach(client => {
    const parts = getPakistanTimeParts(client.nextMeeting);
    const isPast = new Date(client.nextMeeting) < new Date();
    const statusBadge = isPast 
      ? `<span class="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[9px] font-bold">Past</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-bold">Upcoming</span>`;
      
    const item = document.createElement("div");
    item.className = "p-md flex flex-col sm:flex-row sm:items-center justify-between gap-md hover:bg-surface-container-low transition-colors group";
    
    item.innerHTML = `
      <div class="flex items-center gap-md min-w-0">
        <div class="flex flex-col items-center justify-center min-w-[50px] h-[50px] bg-surface-container rounded border border-outline-variant">
          <span class="text-on-surface-variant text-[9px] font-bold">${parts.month}</span>
          <span class="font-bold text-[16px] leading-none text-primary">${parts.day}</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-xs flex-wrap">
            <h4 class="font-bold text-primary group-hover:text-secondary transition-colors truncate text-[13px]">${escapeHtml(client.name)}</h4>
            ${statusBadge}
          </div>
          <p class="text-on-surface-variant text-[11px] truncate mt-0.5">${escapeHtml(client.company || "No company")} • ${escapeHtml(client.service)}</p>
          <p class="text-secondary font-semibold text-[11px] mt-0.5 flex items-center gap-xs">
            <span class="material-symbols-outlined text-[12px]">schedule</span>
            <span>${parts.time} PKT (${parts.full})</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-sm self-end sm:self-auto shrink-0">
        <a href="#profile?id=${client.id}" class="px-md py-1 border border-outline-variant rounded font-semibold text-[11px] text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-xs">
          <span class="material-symbols-outlined text-[12px]">person</span>
          Profile
        </a>
        <button class="btn-cancel-meeting px-md py-1 bg-error-container text-on-error-container rounded font-semibold text-[11px] hover:bg-opacity-90 transition-colors flex items-center gap-xs" data-id="${client.id}">
          <span class="material-symbols-outlined text-[12px]">cancel</span>
          Cancel
        </button>
      </div>
    `;
    
    // Bind Cancel meeting button
    item.querySelector(".btn-cancel-meeting").addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm(`Are you sure you want to cancel the meeting with ${client.name}?`)) {
        try {
          await saveClient(id, { nextMeeting: null });
          render();
          renderMeetingsView();
        } catch (err) {
          alert(`Error cancelling meeting: ${err.message}`);
        }
      }
    });
    
    els.meetingsList.appendChild(item);
  });
}

function renderPipeline() {
  const clients = filteredClients();
  if (!els.board) return;
  els.board.innerHTML = "";

  for (const stage of stages) {
    const stageClients = clients.filter((client) => client.stage === stage.id);
    const stageValue = stageClients.reduce((sum, client) => sum + totalValue(client), 0);
    const column = document.createElement("section");
    column.className = "kanban-column flex flex-col gap-sm h-full shrink-0";
    column.dataset.stageId = stage.id;
    column.innerHTML = `
      <div class="flex items-center justify-between px-xs shrink-0 mb-1">
        <div class="flex items-center gap-sm">
          <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${stage.label}</span>
          <span class="px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-bold text-[9px]">${stageClients.length}</span>
        </div>
        <span class="text-[9px] font-bold text-secondary bg-secondary-container/20 px-1 py-0.5 rounded">${money.format(stageValue)}</span>
      </div>
      <div class="client-list flex-1 bg-surface-container-low/40 border border-outline-variant rounded-lg p-1.5 space-y-1.5 overflow-y-auto min-h-[400px]"></div>
    `;

    const list = column.querySelector(".client-list");
    if (!stageClients.length) {
      const empty = document.createElement("p");
      empty.className = "empty-stage text-on-surface-variant text-[11px] text-center py-md mt-sm";
      empty.textContent = "No clients.";
      list.append(empty);
    }

    for (const client of stageClients) {
      const card = document.createElement("div");
      card.className = `client-card bg-surface-container-lowest border border-outline-variant p-2.5 rounded hover:border-primary transition-all cursor-grab active:cursor-grabbing group relative select-none${client.id === state.selectedId ? " border-primary ring-1 ring-primary/5" : ""}`;
      card.dataset.clientId = client.id;
      card.draggable = true;
      card.innerHTML = `
        <div class="flex justify-between items-start mb-1">
          <span class="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-semibold truncate max-w-[120px] block">${escapeHtml(client.service)}</span>
          <span class="material-symbols-outlined text-outline-variant group-hover:text-primary select-none drag-handle">drag_indicator</span>
        </div>
        <h3 class="text-[12.5px] font-bold text-on-surface mb-0.5 truncate">${escapeHtml(client.name)}</h3>
        <p class="text-on-surface-variant text-[11px] mb-2 truncate">${escapeHtml(client.company || "No company")}</p>
        <div class="flex justify-between items-center text-on-surface-variant border-t border-outline-variant/30 pt-1 mt-1">
          <span class="capitalize px-1 rounded bg-surface-container text-on-surface text-[9px] font-bold">${escapeHtml(client.priority || "Warm")}</span>
          <div class="text-right shrink-0">
            <span class="font-bold text-secondary text-[11px] block">${money.format(Number(client.monthlyValue || 0))}/mo</span>
            <span class="text-[9px] text-on-surface-variant block font-medium">TCV: ${money.format(totalValue(client))}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".drag-handle")) return; // Don't trigger click navigation on drag handle click
        window.location.hash = `#profile?id=${client.id}`;
      });

      list.append(card);
    }

    els.board.append(column);
  }
}

function renderProfile() {
  const client = state.clients.find((item) => item.id === state.selectedId);
  if (!client) {
    if (els.profileEmpty) els.profileEmpty.classList.remove("hidden");
    if (els.profileForm) els.profileForm.classList.add("hidden");
    return;
  }

  if (els.profileEmpty) els.profileEmpty.classList.add("hidden");
  if (els.profileForm) els.profileForm.classList.remove("hidden");

  const active = document.activeElement;
  if (active !== fields.name) fields.name.value = client.name || "";
  if (active !== fields.company) fields.company.value = client.company || "";
  if (active !== fields.email) fields.email.value = client.email || "";
  if (active !== fields.phone) fields.phone.value = client.phone || "";
  if (active !== fields.service) fields.service.value = client.service || "Real Estate VA";
  if (active !== fields.stage) fields.stage.value = client.stage || "outreach_done";
  if (active !== fields.priority) fields.priority.value = client.priority || "Warm";
  if (active !== fields.monthlyValue) fields.monthlyValue.value = client.monthlyValue || 0;
  if (active !== fields.setupFee) fields.setupFee.value = client.setupFee || 0;
  if (active !== fields.contractMonths) fields.contractMonths.value = client.contractMonths || 1;
  if (active !== fields.probability) fields.probability.value = client.probability || 0;
  if (active !== fields.nextMeeting) fields.nextMeeting.value = toInputDateTime(client.nextMeeting);
  if (active !== fields.notes) fields.notes.value = client.notes || "";
  if (active !== fields.tasks) fields.tasks.value = Array.isArray(client.tasks) ? client.tasks.join("\n") : "";

  if (els.profilePriority) els.profilePriority.textContent = client.priority || "Warm";

  const isEditingFinancials = active === fields.monthlyValue || active === fields.setupFee || active === fields.contractMonths;
  const monthly = isEditingFinancials ? Number(fields.monthlyValue.value || 0) : Number(client.monthlyValue || 0);
  const setup = isEditingFinancials ? Number(fields.setupFee.value || 0) : Number(client.setupFee || 0);
  const months = isEditingFinancials ? Number(fields.contractMonths.value || 1) : Number(client.contractMonths || 1);
  const total = setup + monthly * months;

  if (els.profileMonthly) els.profileMonthly.textContent = money.format(monthly);
  if (els.profileTotal) els.profileTotal.textContent = money.format(total);

  const currentStage = stages.find((stage) => stage.id === client.stage);
  const stageLabel = currentStage ? currentStage.label : "Pipeline health";
  if (els.focusStage) els.focusStage.textContent = stageLabel;
  if (els.profileStageBadge) els.profileStageBadge.textContent = stageLabel;
  if (els.focusCopy) {
    els.focusCopy.textContent = `${client.name} is worth ${money.format(weightedValue(client))} weighted in the pipeline.`;
  }

  // Render notes dynamic history timeline
  renderNotesTimeline(client);
}

function renderNotesTimeline(client) {
  if (!els.notesTimeline) return;
  els.notesTimeline.innerHTML = "";

  const notesList = (client.notes || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (notesList.length === 0) {
    els.notesTimeline.innerHTML = `
      <div class="text-on-surface-variant text-label-sm text-center py-md pl-md">
        No timeline entries yet. Add notes to populate.
      </div>
    `;
    return;
  }

  notesList.forEach((note, index) => {
    const item = document.createElement("div");
    item.className = "relative pl-lg border-l-2 border-outline-variant py-xs ml-3";

    // Style first timeline node as green/teal and active, others as gray
    const dotClass = index === 0 ? "bg-white border-2 border-secondary" : "bg-surface-container-highest border-2 border-outline";
    const dateText = client.updatedAt ? formatDate(client.updatedAt) : "RECENT";

    item.innerHTML = `
      <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full ${dotClass}"></div>
      <p class="font-label-sm text-label-sm text-on-surface-variant uppercase text-[10px]">${dateText}</p>
      <p class="font-body-md text-body-md mt-xs text-primary font-medium leading-relaxed">${escapeHtml(note)}</p>
    `;
    els.notesTimeline.append(item);
  });
}

function render() {
  renderMetrics();
  renderPipeline();
  renderProfile();
  renderMeetingsView();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadClients() {
  try {
    const response = await fetch("/api/clients");
    if (!response.ok) {
      let errMsg = "Failed to load clients";
      try {
        const errData = await response.json();
        if (errData && errData.error) {
          errMsg = errData.error;
        }
      } catch (_) {}
      throw new Error(errMsg);
    }
    state.clients = await response.json();
  } catch (err) {
    console.error("Error loading clients:", err);
    state.clients = [];
    if (els.saveStatus) {
      els.saveStatus.textContent = `Error loading leads: ${err.message}`;
    }
  }
  
  // Set selected client if not set
  const hash = window.location.hash || "#dashboard";
  if (hash.startsWith("#profile")) {
    const params = new URLSearchParams(hash.slice(hash.indexOf("?")));
    const id = params.get("id");
    if (id) {
      state.selectedId = id;
    }
  }
  
  if (!state.selectedId && state.clients.length > 0) {
    state.selectedId = state.clients[0].id;
  }

  render();
  handleRoute();
}

async function loadClientsSilently() {
  try {
    const response = await fetch("/api/clients");
    if (!response.ok) return;
    const updatedClients = await response.json();
    state.clients = updatedClients;
    render();
  } catch (err) {
    console.error("Silent reload failed:", err);
  }
}

function initRealtime() {
  const source = new EventSource("/api/events");
  
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "update") {
        loadClientsSilently();
      }
    } catch (err) {
      console.error("Failed to parse SSE message:", err);
    }
  };
  
  source.onerror = (err) => {
    console.warn("Realtime stream disconnected, retrying in 5s...", err);
    source.close();
    setTimeout(initRealtime, 5000);
  };
}

async function saveClient(id, payload) {
  const response = await fetch(`/api/clients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    let errMsg = "Unable to save client";
    try {
      const errData = await response.json();
      if (errData && errData.error) {
        errMsg = errData.error;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }
  const updated = await response.json();
  state.clients = state.clients.map((client) => client.id === id ? updated : client);
  return updated;
}

async function createClient() {
  const response = await fetch("/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "New Lead",
      company: "Company name",
      service: "Real Estate VA",
      stage: "outreach_done",
      priority: "New",
      monthlyValue: 3000,
      setupFee: 500,
      contractMonths: 6,
      probability: 20,
      notes: "Add client background, requirements, and decision notes.",
      tasks: ["Onboard new lead", "Schedule discovery call"]
    })
  });
  if (!response.ok) {
    let errMsg = "Unable to create client";
    try {
      const errData = await response.json();
      if (errData && errData.error) {
        errMsg = errData.error;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }
  const client = await response.json();
  state.clients.unshift(client);
  state.selectedId = client.id;
  render();

  // Redirect to the newly created profile page
  window.location.hash = `#profile?id=${client.id}`;
}

function collectProfilePayload() {
  return {
    name: fields.name.value.trim(),
    company: fields.company.value.trim(),
    email: fields.email.value.trim(),
    phone: fields.phone.value.trim(),
    service: fields.service.value,
    stage: fields.stage.value,
    priority: fields.priority.value,
    monthlyValue: Number(fields.monthlyValue.value || 0),
    setupFee: Number(fields.setupFee.value || 0),
    contractMonths: Number(fields.contractMonths.value || 1),
    probability: Number(fields.probability.value || 0),
    nextMeeting: fields.nextMeeting.value ? fromPakistanInputDateTime(fields.nextMeeting.value) : null,
    notes: fields.notes.value.trim(),
    tasks: fields.tasks.value
      .split("\n")
      .map((task) => task.trim())
      .filter(Boolean)
  };
}

function populateStageSelect() {
  if (fields.stage) {
    fields.stage.innerHTML = stages
      .map((stage) => `<option value="${stage.id}">${stage.label}</option>`)
      .join("");
  }
}

// Drag & Drop Board listeners
els.board.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".client-card");
  if (!card) return;
  state.draggingId = card.dataset.clientId;
  state.selectedId = state.draggingId;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggingId);
  renderProfile();
});

els.board.addEventListener("dragend", (event) => {
  const card = event.target.closest(".client-card");
  if (card) card.classList.remove("dragging");
  state.draggingId = null;
  document.querySelectorAll(".client-list").forEach((column) => {
    column.classList.remove("bg-secondary-container/10", "border-dashed", "border-secondary/40");
  });
});

els.board.addEventListener("dragover", (event) => {
  const column = event.target.closest(".kanban-column");
  if (!column || !state.draggingId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  
  const list = column.querySelector(".client-list");
  if (list) {
    document.querySelectorAll(".client-list").forEach((item) => {
      if (item !== list) {
        item.classList.remove("bg-secondary-container/10", "border-dashed", "border-secondary/40");
      }
    });
    list.classList.add("bg-secondary-container/10", "border-dashed", "border-secondary/40");
  }
});

els.board.addEventListener("dragleave", (event) => {
  const column = event.target.closest(".kanban-column");
  if (!column) return;
  const list = column.querySelector(".client-list");
  if (list && !list.contains(event.relatedTarget)) {
    list.classList.remove("bg-secondary-container/10", "border-dashed", "border-secondary/40");
  }
});

els.board.addEventListener("drop", async (event) => {
  const column = event.target.closest(".kanban-column");
  if (!column) return;
  event.preventDefault();

  const list = column.querySelector(".client-list");
  if (list) list.classList.remove("bg-secondary-container/10", "border-dashed", "border-secondary/40");

  const clientId = event.dataTransfer.getData("text/plain") || state.draggingId;
  const client = state.clients.find((item) => item.id === clientId);
  const nextStage = column.dataset.stageId;
  if (!client || !nextStage || client.stage === nextStage) return;

  const previousStage = client.stage;
  const previousPriority = client.priority;
  const previousProbability = client.probability;
  client.stage = nextStage;
  client.priority = priorityForStage(nextStage, client.priority);
  client.probability = probabilityForStage(nextStage, client.probability);
  state.selectedId = client.id;
  render();

  try {
    const updated = await saveClient(client.id, {
      stage: client.stage,
      priority: client.priority,
      probability: client.probability
    });
    if (els.saveStatus) {
      els.saveStatus.textContent = `Moved to ${stages.find((stage) => stage.id === updated.stage)?.label || "new stage"}`;
    }
    render();
  } catch (error) {
    client.stage = previousStage;
    client.priority = previousPriority;
    client.probability = previousProbability;
    if (els.saveStatus) els.saveStatus.textContent = error.message;
    render();
  }
});

// Search input
els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderPipeline();
  renderMetrics();
  renderSearchSuggestions();
});

function renderSearchSuggestions() {
  if (!els.searchSuggestions) return;
  const val = state.query.trim().toLowerCase();
  if (!val) {
    els.searchSuggestions.innerHTML = "";
    els.searchSuggestions.classList.add("hidden");
    return;
  }

  const matches = state.clients.filter(client => 
    client.name.toLowerCase().includes(val) || 
    (client.company && client.company.toLowerCase().includes(val)) ||
    (client.service && client.service.toLowerCase().includes(val))
  );

  if (matches.length === 0) {
    els.searchSuggestions.innerHTML = `<div class="p-sm text-[11px] text-on-surface-variant">No matching leads found</div>`;
    els.searchSuggestions.classList.remove("hidden");
    return;
  }

  els.searchSuggestions.innerHTML = matches.map(client => `
    <div class="suggestion-item p-sm hover:bg-surface-container-low cursor-pointer transition-colors text-[12px] font-medium text-primary flex justify-between items-center" data-id="${client.id}">
      <div>
        <div class="font-bold text-primary">${escapeHtml(client.name)}</div>
        <div class="text-[10px] text-on-surface-variant font-normal">${escapeHtml(client.company || "No company")}</div>
      </div>
      <span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-semibold">${escapeHtml(client.service)}</span>
    </div>
  `).join("");

  els.searchSuggestions.classList.remove("hidden");
}

function initSearchSuggestions() {
  if (els.searchSuggestions) {
    els.searchSuggestions.addEventListener("click", (e) => {
      const item = e.target.closest(".suggestion-item");
      if (!item) return;

      const id = item.dataset.id;

      // Navigate to profile
      window.location.hash = `#profile?id=${id}`;

      // Clear search input and suggestion dropdown
      els.search.value = "";
      state.query = "";
      els.searchSuggestions.classList.add("hidden");

      // Reset view updates
      render();
    });
  }

  // Close suggestions on clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#clientSearch") && !e.target.closest("#search-suggestions")) {
      if (els.searchSuggestions) {
        els.searchSuggestions.classList.add("hidden");
      }
    }
  });
}

// Category Filter buttons
els.filters.forEach((button) => {
  button.addEventListener("click", () => {
    els.filters.forEach((filter) => filter.classList.remove("active", "bg-secondary", "text-white"));
    button.classList.add("active", "bg-secondary", "text-white");
    state.service = button.dataset.service;
    renderPipeline();
  });
});

// Profile Form save action
els.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedId) return;
  els.saveStatus.textContent = "Saving...";
  try {
    await saveClient(state.selectedId, collectProfilePayload());
    els.saveStatus.textContent = "Changes Saved";
    setTimeout(() => {
      if (els.saveStatus.textContent === "Changes Saved") {
        els.saveStatus.textContent = "";
      }
    }, 3000);
    render();
  } catch (error) {
    els.saveStatus.textContent = error.message;
  }
});

// Advance Stage Button
els.advanceStageButton.addEventListener("click", async () => {
  const client = state.clients.find((item) => item.id === state.selectedId);
  if (!client) return;
  const currentIndex = stages.findIndex((stage) => stage.id === client.stage);
  const nextStage = stages[Math.min(currentIndex + 1, stages.length - 1)];
  els.saveStatus.textContent = "Moving...";
  try {
    await saveClient(client.id, {
      stage: nextStage.id,
      priority: priorityForStage(nextStage.id, client.priority),
      probability: probabilityForStage(nextStage.id, client.probability)
    });
    els.saveStatus.textContent = "Stage advanced";
    setTimeout(() => {
      if (els.saveStatus.textContent === "Stage advanced") {
        els.saveStatus.textContent = "";
      }
    }, 3000);
    render();
  } catch (error) {
    els.saveStatus.textContent = error.message;
  }
});

// Delete Client Button
if (els.deleteClientButton) {
  els.deleteClientButton.addEventListener("click", async () => {
    const client = state.clients.find((item) => item.id === state.selectedId);
    if (!client) return;
    if (confirm(`Are you sure you want to permanently delete lead "${client.name}"? This action cannot be undone.`)) {
      els.saveStatus.textContent = "Deleting...";
      try {
        const response = await fetch(`/api/clients/${client.id}`, {
          method: "DELETE"
        });
        if (!response.ok) {
          let errMsg = "Unable to delete client";
          try {
            const errData = await response.json();
            if (errData && errData.error) {
              errMsg = errData.error;
            }
          } catch (_) {}
          throw new Error(errMsg);
        }
        
        els.saveStatus.textContent = "Client deleted";
        
        // Remove from local state
        state.clients = state.clients.filter(c => c.id !== client.id);
        state.selectedId = state.clients[0]?.id || null;
        
        // Redirect to pipeline
        window.location.hash = "#pipeline";
        render();
      } catch (error) {
        els.saveStatus.textContent = error.message;
        alert(`Failed to delete client: ${error.message}`);
      }
    }
  });
}

// New Lead click action
els.newClientButton.addEventListener("click", async () => {
  els.saveStatus.textContent = "Creating...";
  try {
    await createClient();
    els.saveStatus.textContent = "New client ready";
  } catch (error) {
    els.saveStatus.textContent = error.message;
    alert(`Failed to create lead: ${error.message}`);
  }
});

// Quick Action click action
const quickActionBtn = document.querySelector("#dashboard-quick-action");
if (quickActionBtn) {
  quickActionBtn.addEventListener("click", async () => {
    if (els.saveStatus) els.saveStatus.textContent = "Creating...";
    try {
      await createClient();
      if (els.saveStatus) els.saveStatus.textContent = "New client ready";
    } catch (error) {
      if (els.saveStatus) els.saveStatus.textContent = error.message;
      alert(`Failed to create lead: ${error.message}`);
    }
  });
}

// Client router logic based on hash routing
function handleRoute() {
  const hash = window.location.hash || "#dashboard";
  const views = ["dashboard", "pipeline", "meetings", "profile", "settings"];
  
  views.forEach(view => {
    const pane = document.querySelector(`#view-${view}`);
    if (pane) {
      if (hash.startsWith(`#${view}`)) {
        pane.classList.remove("hidden");
      } else {
        pane.classList.add("hidden");
      }
    }
  });

  // Highlight active link in Sidebar
  const navLinks = {
    dashboard: document.querySelector("#nav-dashboard"),
    pipeline: document.querySelector("#nav-pipeline"),
    meetings: document.querySelector("#nav-meetings"),
    profile: document.querySelector("#nav-profile")
  };

  Object.entries(navLinks).forEach(([key, link]) => {
    if (!link) return;
    if (hash.startsWith(`#${key}`)) {
      link.className = "flex items-center gap-md bg-on-primary/10 dark:bg-on-tertiary-container/10 text-on-primary dark:text-on-tertiary-container font-bold rounded-lg px-md py-sm scale-98 transition-transform group";
    } else {
      link.className = "flex items-center gap-md text-on-primary/70 dark:text-on-tertiary-container/70 px-md py-sm hover:bg-on-primary/5 dark:hover:bg-on-tertiary-container/5 rounded-lg transition-colors group";
    }
  });

  // Highlight active link in Mobile Navigation
  const mobileNavLinks = {
    dashboard: document.querySelector("#mobile-nav-dashboard"),
    pipeline: document.querySelector("#mobile-nav-pipeline"),
    meetings: document.querySelector("#mobile-nav-meetings"),
    profile: document.querySelector("#mobile-nav-profile")
  };

  Object.entries(mobileNavLinks).forEach(([key, link]) => {
    if (!link) return;
    const icon = link.querySelector(".material-symbols-outlined");
    if (hash.startsWith(`#${key}`)) {
      link.className = "flex flex-col items-center gap-xs text-primary font-bold";
      if (icon) icon.style.fontVariationSettings = "'FILL' 1";
    } else {
      link.className = "flex flex-col items-center gap-xs text-on-surface-variant";
      if (icon) icon.style.fontVariationSettings = "'FILL' 0";
    }
  });

  // Update Topbar title and toggle Search Box visibility
  if (hash.startsWith("#dashboard")) {
    if (els.topbarTitle) els.topbarTitle.textContent = "Executive Dashboard";
    if (els.searchContainer) els.searchContainer.classList.remove("hidden");
  } else if (hash.startsWith("#pipeline")) {
    if (els.topbarTitle) els.topbarTitle.textContent = "Sales Pipeline";
    if (els.searchContainer) els.searchContainer.classList.remove("hidden");
  } else if (hash.startsWith("#meetings")) {
    if (els.topbarTitle) els.topbarTitle.textContent = "Meetings Schedule";
    if (els.searchContainer) els.searchContainer.classList.add("hidden");
    renderMeetingsView();
  } else if (hash.startsWith("#profile")) {
    if (els.topbarTitle) els.topbarTitle.textContent = "Client Profile";
    if (els.searchContainer) els.searchContainer.classList.add("hidden");
    
    // Parse client id query from URL
    const queryIdx = hash.indexOf("?");
    if (queryIdx !== -1) {
      const params = new URLSearchParams(hash.slice(queryIdx));
      const id = params.get("id");
      if (id && id !== state.selectedId) {
        state.selectedId = id;
        renderProfile();
      }
    }
  } else if (hash.startsWith("#settings")) {
    if (els.topbarTitle) els.topbarTitle.textContent = "Integration Settings";
    if (els.searchContainer) els.searchContainer.classList.add("hidden");
    loadWaSettings();
  }
}

// Current date text for Dashboard greeting (dynamic Pakistan timezone clock)
function updateDashboardDate() {
  const dateEl = document.querySelector("#dashboard-date");
  if (dateEl) {
    const updateClock = () => {
      const now = new Date();
      const options = {
        timeZone: "Asia/Karachi",
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
      };
      dateEl.textContent = now.toLocaleString("en-US", options) + " PKT";
    };
    updateClock();
    setInterval(updateClock, 1000);
  }
}

function initMeetingsView() {
  if (els.meetingClientSearch) {
    els.meetingClientSearch.addEventListener("input", (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (!val) {
        els.meetingClientSuggestions.innerHTML = "";
        els.meetingClientSuggestions.classList.add("hidden");
        els.meetingClientId.value = "";
        return;
      }
      
      const matches = state.clients.filter(client => 
        client.name.toLowerCase().includes(val) || 
        (client.company && client.company.toLowerCase().includes(val))
      );
      
      if (matches.length === 0) {
        els.meetingClientSuggestions.innerHTML = `<div class="p-sm text-[11px] text-on-surface-variant">No matching clients found</div>`;
        els.meetingClientSuggestions.classList.remove("hidden");
        return;
      }
      
      els.meetingClientSuggestions.innerHTML = matches.map(client => `
        <div class="suggestion-item p-sm hover:bg-surface-container-low cursor-pointer transition-colors text-[12px] font-medium text-primary flex justify-between items-center" data-id="${client.id}" data-name="${escapeHtml(client.name)}">
          <div>
            <div class="font-bold">${escapeHtml(client.name)}</div>
            <div class="text-[10px] text-on-surface-variant font-normal">${escapeHtml(client.company || "No company")}</div>
          </div>
          <span class="text-[9px] uppercase px-1 rounded bg-secondary-container text-on-secondary-container font-semibold">${escapeHtml(client.service)}</span>
        </div>
      `).join("");
      
      els.meetingClientSuggestions.classList.remove("hidden");
    });

    // Close suggestions on clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#meetingClientSearch") && !e.target.closest("#meetingClientSuggestions")) {
        if (els.meetingClientSuggestions) {
          els.meetingClientSuggestions.classList.add("hidden");
        }
      }
    });

    // Handle suggestion item selection
    els.meetingClientSuggestions.addEventListener("click", (e) => {
      const item = e.target.closest(".suggestion-item");
      if (!item) return;
      
      const id = item.dataset.id;
      const name = item.dataset.name;
      
      els.meetingClientSearch.value = name;
      els.meetingClientId.value = id;
      els.meetingClientSuggestions.classList.add("hidden");
    });
  }

  if (els.scheduleMeetingForm) {
    els.scheduleMeetingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const clientId = els.meetingClientId.value;
      const dateTimeVal = els.meetingDateTime.value;
      const clientName = els.meetingClientSearch.value.trim();
      
      if (!clientId || !dateTimeVal) {
        els.scheduleStatus.textContent = "Please select a client and date/time.";
        els.scheduleStatus.className = "text-[11px] font-bold text-error text-center mt-1";
        return;
      }
      
      // Verify client still exists and matching name
      const client = state.clients.find(c => c.id === clientId);
      if (!client || client.name !== clientName) {
        els.scheduleStatus.textContent = "Invalid client selection. Please select from the suggestions.";
        els.scheduleStatus.className = "text-[11px] font-bold text-error text-center mt-1";
        return;
      }
      
      els.scheduleStatus.textContent = "Scheduling...";
      els.scheduleStatus.className = "text-[11px] font-bold text-on-surface-variant text-center mt-1";
      
      try {
        const utcIsoString = fromPakistanInputDateTime(dateTimeVal);
        await saveClient(clientId, { nextMeeting: utcIsoString });
        
        els.scheduleStatus.textContent = "Meeting scheduled successfully!";
        els.scheduleStatus.className = "text-[11px] font-bold text-secondary text-center mt-1";
        
        // Reset form
        els.meetingClientSearch.value = "";
        els.meetingClientId.value = "";
        els.meetingDateTime.value = "";
        
        setTimeout(() => {
          if (els.scheduleStatus.textContent === "Meeting scheduled successfully!") {
            els.scheduleStatus.textContent = "";
          }
        }, 3000);
        
        render();
        renderMeetingsView();
      } catch (err) {
        els.scheduleStatus.textContent = `Error: ${err.message}`;
        els.scheduleStatus.className = "text-[11px] font-bold text-error text-center mt-1";
      }
    });
  }
}

function initFinancialsListeners() {
  const updateProfileFinancialsReadout = () => {
    const monthly = Number(fields.monthlyValue.value || 0);
    const setup = Number(fields.setupFee.value || 0);
    const months = Math.max(1, Number(fields.contractMonths.value) || 1);
    const total = setup + monthly * months;
    if (els.profileTotal) els.profileTotal.textContent = money.format(total);
    if (els.profileMonthly) els.profileMonthly.textContent = money.format(monthly);
  };
  
  if (fields.monthlyValue) fields.monthlyValue.addEventListener("input", updateProfileFinancialsReadout);
  if (fields.setupFee) fields.setupFee.addEventListener("input", updateProfileFinancialsReadout);
  if (fields.contractMonths) fields.contractMonths.addEventListener("input", updateProfileFinancialsReadout);
}

let isSubscribed = false;
let swRegistration = null;

function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function updatePushSubscriptionUI() {
  if (!els.btnToggleNotifications) return;
  
  if (Notification.permission === "denied") {
    els.btnToggleNotifications.title = "Notifications Blocked (Reset in settings)";
    const icon = els.btnToggleNotifications.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = "notifications_off";
    if (els.btnSendTestPush) els.btnSendTestPush.classList.add("hidden");
    if (els.notifBadge) els.notifBadge.classList.add("hidden");
    return;
  }

  if (isSubscribed) {
    els.btnToggleNotifications.title = "Notifications Active";
    const icon = els.btnToggleNotifications.querySelector(".material-symbols-outlined");
    if (icon) {
      icon.textContent = "notifications_active";
      icon.style.fontVariationSettings = "'FILL' 1";
    }
    if (els.btnSendTestPush) els.btnSendTestPush.classList.remove("hidden");
    if (els.notifBadge) els.notifBadge.classList.remove("hidden");
  } else {
    els.btnToggleNotifications.title = "Enable Notifications";
    const icon = els.btnToggleNotifications.querySelector(".material-symbols-outlined");
    if (icon) {
      icon.textContent = "notifications";
      icon.style.fontVariationSettings = "'FILL' 0";
    }
    if (els.btnSendTestPush) els.btnSendTestPush.classList.add("hidden");
    if (els.notifBadge) els.notifBadge.classList.add("hidden");
  }
}

async function subscribeUser() {
  try {
    const res = await fetch("/api/vapid-public-key");
    const { publicKey } = await res.json();
    const applicationServerKey = urlB64ToUint8Array(publicKey);
    
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });
    
    await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription)
    });
    
    isSubscribed = true;
    updatePushSubscriptionUI();
    console.log("User subscribed successfully.");
  } catch (err) {
    console.error("Failed to subscribe user:", err);
  }
}

async function unsubscribeUser() {
  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    isSubscribed = false;
    updatePushSubscriptionUI();
    console.log("User unsubscribed successfully.");
  } catch (err) {
    console.error("Failed to unsubscribe user:", err);
  }
}

async function initPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push notifications are not supported in this browser.");
    if (els.btnToggleNotifications) els.btnToggleNotifications.classList.add("hidden");
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker registered successfully:", swRegistration);

    const subscription = await swRegistration.pushManager.getSubscription();
    isSubscribed = !(subscription === null);
    
    updatePushSubscriptionUI();

    if (els.btnToggleNotifications) {
      els.btnToggleNotifications.addEventListener("click", async () => {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            updatePushSubscriptionUI();
            return;
          }
        }
        
        if (isSubscribed) {
          await unsubscribeUser();
        } else {
          await subscribeUser();
        }
      });
    }

    if (els.btnSendTestPush) {
      els.btnSendTestPush.addEventListener("click", async () => {
        els.btnSendTestPush.disabled = true;
        const oldText = els.btnSendTestPush.textContent;
        els.btnSendTestPush.textContent = "Sending...";
        try {
          const res = await fetch("/api/test-push", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            console.log("Test notification triggered.");
          } else {
            alert(data.message || "Failed to trigger test notification.");
          }
        } catch (err) {
          console.error("Test notification error:", err);
        } finally {
          els.btnSendTestPush.disabled = false;
          els.btnSendTestPush.textContent = oldText;
        }
      });
    }
  } catch (err) {
    console.error("Service worker registration / initialization failed:", err);
  }
}

const waFields = {
  enabled: document.querySelector("#waEnabled"),
  apiUrl: document.querySelector("#waApiUrl"),
  sessionId: document.querySelector("#waSessionId"),
  apiKey: document.querySelector("#waApiKey"),
  recipientPhone: document.querySelector("#waRecipientPhone")
};

async function loadWaSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    
    if (waFields.enabled) waFields.enabled.checked = !!data.whatsappEnabled;
    if (waFields.apiUrl) waFields.apiUrl.value = data.whatsappApiUrl || "http://localhost:2785/api";
    if (waFields.sessionId) waFields.sessionId.value = data.whatsappSessionId || "default";
    if (waFields.apiKey) waFields.apiKey.value = data.whatsappApiKey || "";
    if (waFields.recipientPhone) waFields.recipientPhone.value = data.whatsappRecipientPhone || "";
  } catch (err) {
    console.error("Failed to load WhatsApp settings:", err);
  }
}

function initWaSettings() {
  const form = document.querySelector("#whatsapp-settings-form");
  const statusEl = document.querySelector("#waSettingsStatus");
  const testBtn = document.querySelector("#btnTestWaMessage");
  
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.textContent = "Saving...";
      statusEl.className = "text-[11px] font-bold text-on-surface-variant mt-1";
      
      const payload = {
        whatsappEnabled: waFields.enabled.checked,
        whatsappApiUrl: waFields.apiUrl.value.trim(),
        whatsappSessionId: waFields.sessionId.value.trim(),
        whatsappApiKey: waFields.apiKey.value.trim(),
        whatsappRecipientPhone: waFields.recipientPhone.value.trim()
      };
      
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          statusEl.textContent = "Settings saved successfully!";
          statusEl.className = "text-[11px] font-bold text-secondary mt-1";
        } else {
          statusEl.textContent = "Failed to save settings.";
          statusEl.className = "text-[11px] font-bold text-error mt-1";
        }
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className = "text-[11px] font-bold text-error mt-1";
      }
    });
  }
  
  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      statusEl.textContent = "Sending test message...";
      statusEl.className = "text-[11px] font-bold text-on-surface-variant mt-1";
      
      try {
        const res = await fetch("/api/test-whatsapp", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          statusEl.textContent = "Test WhatsApp message sent successfully!";
          statusEl.className = "text-[11px] font-bold text-secondary mt-1";
        } else {
          statusEl.textContent = `Failed: ${data.message || "Unknown error"}`;
          statusEl.className = "text-[11px] font-bold text-error mt-1";
        }
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className = "text-[11px] font-bold text-error mt-1";
      }
    });
  }

  // Handle push notification toggles inside settings view as well
  const settingsBtnToggleNotifications = document.querySelector("#settingsBtnToggleNotifications");
  const settingsBtnSendTestPush = document.querySelector("#settingsBtnSendTestPush");
  const settingsNotifText = document.querySelector("#settingsNotifText");

  const syncSettingsPushUI = () => {
    if (!settingsBtnToggleNotifications) return;
    if (Notification.permission === "denied") {
      settingsNotifText.textContent = "Notifications Blocked";
      if (settingsBtnSendTestPush) settingsBtnSendTestPush.classList.add("hidden");
    } else if (isSubscribed) {
      settingsNotifText.textContent = "Notifications Active";
      if (settingsBtnSendTestPush) settingsBtnSendTestPush.classList.remove("hidden");
    } else {
      settingsNotifText.textContent = "Enable Notifications";
      if (settingsBtnSendTestPush) settingsBtnSendTestPush.classList.add("hidden");
    }
  };

  if (settingsBtnToggleNotifications) {
    settingsBtnToggleNotifications.addEventListener("click", async () => {
      const headerBtn = document.querySelector("#btnToggleNotifications");
      if (headerBtn) {
        headerBtn.click();
        setTimeout(syncSettingsPushUI, 500);
      }
    });
  }

  if (settingsBtnSendTestPush) {
    settingsBtnSendTestPush.addEventListener("click", () => {
      const headerTestBtn = document.querySelector("#btnSendTestPush");
      if (headerTestBtn) headerTestBtn.click();
    });
  }

  setTimeout(syncSettingsPushUI, 1000);
}

async function checkDbStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const status = await res.json();
    const banner = document.querySelector("#db-warning-banner");
    if (!banner) return;

    if (!status.supabaseConfigured) {
      banner.className = "bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/40 p-md flex items-start gap-md text-amber-900 dark:text-amber-200";
      
      let errorDetailHtml = "";
      if (status.error) {
        errorDetailHtml = `
          <p class="text-[11px] font-mono mt-1 bg-amber-100/50 dark:bg-amber-950/50 p-sm rounded border border-amber-200/50 max-w-xl">
            <strong>Diagnostic error:</strong> ${escapeHtml(status.error)}
          </p>
        `;
      }
      
      banner.innerHTML = `
        <span class="material-symbols-outlined text-amber-500 dark:text-amber-400 shrink-0 mt-0.5">warning</span>
        <div class="flex-grow">
          <h4 class="font-bold text-[13px] text-amber-950 dark:text-amber-100">Database Connection Required</h4>
          <p class="text-[12px] mt-0.5 leading-relaxed">
            The CRM database is currently running in fallback/read-only mode because Supabase is not configured. 
            Leads cannot be added or modified. To fix this, please define 
            <code class="px-1 py-0.5 rounded bg-amber-100/60 font-mono text-[11px]">SUPABASE_URL</code> and 
            <code class="px-1 py-0.5 rounded bg-amber-100/60 font-mono text-[11px]">SUPABASE_KEY</code> in your environment variables.
          </p>
          ${errorDetailHtml}
          <div class="mt-sm flex gap-md text-[11px] font-bold">
            <span class="text-amber-800 dark:text-amber-300">Target URL must be e.g. <code class="font-mono bg-amber-100/30 px-1 py-0.5 rounded">https://yourproject.supabase.co</code></span>
          </div>
        </div>
      `;
    } else {
      banner.className = "hidden";
      banner.innerHTML = "";
    }
  } catch (err) {
    console.error("Failed to check DB status:", err);
  }
}

window.addEventListener("hashchange", handleRoute);

// Bootstrap
populateStageSelect();
checkDbStatus();
loadClients();
updateDashboardDate();
initMeetingsView();
initFinancialsListeners();
initSearchSuggestions();
initPushNotifications();
initWaSettings();
initRealtime();
