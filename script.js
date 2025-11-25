(() => {
  renderFeedbackBanner();

  const calendarRoot = document.getElementById("calendar-root");
  if (!calendarRoot) {
    return;
  }

  initializeCalendar();

  const GOOGLE_CLIENT_ID =
    "203366866884-2v8pvrqc6h5n6krlje9729dbnf539f7k.apps.googleusercontent.com";
  const GOOGLE_SCOPES = "openid email profile";
  const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
  const GOOGLE_REDIRECT_URI =
    "https://n8n.delugan.net/webhook/juvenes/collettaalimentare/callback";

  const fullDateFormatter = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  calendarRoot.addEventListener("click", (event) => {
    const target = event.target.closest(".add-btn");
    if (!target) {
      return;
    }

    const payload = {
      date: target.dataset.date,
      luogo: target.dataset.luogo,
      dalle: target.dataset.dalle,
      alle: target.dataset.alle,
      rowNumber: Number(target.dataset.rowNumber) || undefined,
      slotId: Number(target.dataset.slotId) || undefined
    };

    handleAddVolunteer(payload);
  });

  async function initializeCalendar() {
    renderPlaceholderMessage("Caricamento disponibilità in corso...");

    try {
      const availabilityData = await fetchAvailabilityData();
      const groupedSlots = buildGroupingByLocationAndDate(availabilityData);
      renderCalendar(groupedSlots);
    } catch (error) {
      console.error("Errore durante il caricamento delle disponibilità:", error);
      renderPlaceholderMessage(
        "Non è stato possibile caricare le disponibilità. Riprova più tardi."
      );
    }
  }

  function buildGroupingByLocationAndDate(availabilityData) {
    const groups = new Map();

    for (const entry of availabilityData) {
      if (!entry?.data || !entry?.luogo) {
        continue;
      }

      const date = new Date(`${entry.data}T00:00:00`);
      if (Number.isNaN(date.valueOf())) {
        continue;
      }

      const groupKey = `${entry.data}__${entry.luogo}`;
      const maxSlots = Number(entry.n_volontari) || 0;
      const volunteers = [];

      for (let slot = 1; slot <= maxSlots; slot += 1) {
        const parsedVolunteer = parseVolunteerEntry(entry[`volontario_${slot}`]);
        volunteers.push(parsedVolunteer);
      }

      const firstEmptySlotIndex = volunteers.findIndex((name) => !name);

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          isoDate: entry.data,
          luogo: entry.luogo,
          dateLabel: capitalize(fullDateFormatter.format(date)),
          maxVolunteers: maxSlots,
          slots: []
        });
      }

      const group = groups.get(groupKey);
      group.maxVolunteers = Math.max(group.maxVolunteers, maxSlots);
      group.slots.push({
        rowNumber: entry.row_number,
        slotId: entry.ID ?? entry.id,
        dalle: entry.dalle ?? "",
        alle: entry.alle ?? "",
        volunteers,
        maxSlots,
        firstEmptySlotIndex
      });
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.isoDate === b.isoDate) {
        return a.luogo.localeCompare(b.luogo, "it", { sensitivity: "base" });
      }

      return a.isoDate.localeCompare(b.isoDate);
    });
  }

  function renderCalendar(groupedSlots) {
    calendarRoot.innerHTML = "";

    if (!groupedSlots.length) {
      renderPlaceholderMessage(
        "Al momento non ci sono turni disponibili per la Colletta Alimentare."
      );
      return;
    }

    groupedSlots.forEach((group) => {
      group.slots.sort((a, b) => compareTimes(a.dalle, b.dalle));

      const section = document.createElement("section");
      section.className = "location-section";

      const header = document.createElement("div");
      header.className = "location-header";

      const title = document.createElement("div");
      title.className = "location-title";
      title.textContent = group.luogo;

      const subtitle = document.createElement("div");
      subtitle.className = "location-date";
      subtitle.textContent = group.dateLabel;

      header.appendChild(title);
      header.appendChild(subtitle);
      section.appendChild(header);

      const wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";

      const table = document.createElement("table");
      table.setAttribute("role", "grid");

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");

      const timeTh = document.createElement("th");
      timeTh.scope = "col";
      timeTh.textContent = "Fascia oraria";
      headerRow.appendChild(timeTh);

      for (let slotIndex = 0; slotIndex < group.maxVolunteers; slotIndex += 1) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = `Volontario ${slotIndex + 1}`;
        headerRow.appendChild(th);
      }

      thead.appendChild(headerRow);

      const tbody = document.createElement("tbody");

      group.slots.forEach((slot) => {
        const tr = document.createElement("tr");

        const timeCell = document.createElement("td");
        timeCell.className = "time-cell";
        timeCell.textContent = formatTimeRange(slot.dalle, slot.alle);
        tr.appendChild(timeCell);

        for (let slotIndex = 0; slotIndex < group.maxVolunteers; slotIndex += 1) {
          const td = document.createElement("td");
          td.dataset.date = group.isoDate;
          td.dataset.luogo = group.luogo;
          td.dataset.dalle = slot.dalle ?? "";
          td.dataset.alle = slot.alle ?? "";

          if (slot.rowNumber) {
            td.dataset.rowNumber = slot.rowNumber;
          }
          if (slot.slotId) {
            td.dataset.slotId = slot.slotId;
          }

          const volunteerEntry = slot.volunteers[slotIndex] || null;
          const isWithinCapacity = slotIndex < slot.maxSlots;
          const firstEmptySlotIndex =
            typeof slot.firstEmptySlotIndex === "number"
              ? slot.firstEmptySlotIndex
              : slot.volunteers.findIndex((name) => !name);

          if (!isWithinCapacity) {
            td.classList.add("inactive");
            td.textContent = "—";
            tr.appendChild(td);
            continue;
          }

          if (volunteerEntry) {
            td.classList.add("filled");
            if (volunteerEntry.href) {
              const link = document.createElement("a");
              link.href = volunteerEntry.href;
              link.textContent = volunteerEntry.label;
              if (!volunteerEntry.href.startsWith("mailto:")) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
              }
              td.appendChild(link);
            } else {
              td.textContent = volunteerEntry.label;
            }
          } else {
            td.classList.add("empty");
            if (
              firstEmptySlotIndex !== -1 &&
              slotIndex === firstEmptySlotIndex
            ) {
              td.appendChild(
                createAddButton({
                  date: group.isoDate,
                  luogo: group.luogo,
                  dalle: slot.dalle,
                  alle: slot.alle,
                  rowNumber: slot.rowNumber,
                  slotId: slot.slotId
                })
              );
            }
          }

          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      });

      table.appendChild(thead);
      table.appendChild(tbody);
      wrapper.appendChild(table);
      section.appendChild(wrapper);
      calendarRoot.appendChild(section);
    });
  }

  function handleAddVolunteer(slotPayload) {
    redirectToGoogleOAuth(slotPayload);
  }

  function capitalize(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function redirectToGoogleOAuth(slotPayload) {
    const statePayload = btoa(
      JSON.stringify({
        date: slotPayload.date,
        luogo: slotPayload.luogo,
        dalle: slotPayload.dalle,
        alle: slotPayload.alle,
        rowNumber: slotPayload.rowNumber,
        slotId: slotPayload.slotId
      })
    );

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "online",
      include_granted_scopes: "true",
      prompt: "consent",
      state: statePayload
    });

    const popup = window.open(
      `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      "oauth-window",
      "width=500,height=600"
    );

    if (!popup) {
      alert(
        "Impossibile aprire la finestra per il login con Google. Controlla che il blocco popup sia disabilitato."
      );
      return;
    }

    const pollingInterval = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(pollingInterval);
        initializeCalendar();
      }
    }, 800);
  }

  function createAddButton(slotPayload) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-btn";
    button.dataset.date = slotPayload.date;
    button.dataset.luogo = slotPayload.luogo ?? "";
    button.dataset.dalle = slotPayload.dalle ?? "";
    button.dataset.alle = slotPayload.alle ?? "";
    if (slotPayload.rowNumber) {
      button.dataset.rowNumber = slotPayload.rowNumber;
    }
    if (slotPayload.slotId) {
      button.dataset.slotId = slotPayload.slotId;
    }
    button.innerHTML =
      '<span aria-hidden="true">+</span><span class="sr-only">Prenotati per questo turno</span>';
    return button;
  }

  function renderFeedbackBanner() {
    const feedbackEl = document.getElementById("feedback-banner");
    if (!feedbackEl) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const errorMessage = params.get("error");
    const successMessage = params.get("message");

    feedbackEl.className = "feedback-banner";
    feedbackEl.textContent = "";
    feedbackEl.hidden = true;

    if (errorMessage) {
      feedbackEl.textContent = decodeURIComponent(errorMessage);
      feedbackEl.classList.add("error");
      feedbackEl.hidden = false;
    } else if (successMessage) {
      feedbackEl.textContent = decodeURIComponent(successMessage);
      feedbackEl.classList.add("success");
      feedbackEl.hidden = false;
    }
  }

  function parseVolunteerEntry(rawValue) {
    if (!rawValue) {
      return null;
    }

    const trimmedValue = String(rawValue).trim();
    if (!trimmedValue) {
      return null;
    }

    const hyperlinkMatch = trimmedValue.match(
      /^=HYPERLINK\("([^"]+)"\s*;\s*"([^"]+)"\)$/i
    );

    if (hyperlinkMatch) {
      return {
        label: hyperlinkMatch[2],
        href: hyperlinkMatch[1]
      };
    }

    return {
      label: trimmedValue
    };
  }

  async function fetchAvailabilityData() {
    const endpoint =
      "https://n8n.delugan.net/webhook/juvenes/collettaalimentare/slots";

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) {
      throw new Error(
        `Risposta non valida dal server (${response.status} ${response.statusText})`
      );
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const jsonPayload = await response.json();
      return normalizeAvailabilityPayload(jsonPayload);
    }

    const rawText = await response.text();
    return normalizeAvailabilityPayload(rawText);
  }

  function normalizeAvailabilityPayload(payload) {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    if (typeof payload === "string") {
      const trimmed = payload.trim();
      if (!trimmed) {
        return [];
      }

      const decoded = decodeHtmlEntities(trimmed);

      try {
        return normalizeAvailabilityPayload(JSON.parse(trimmed));
      } catch {
        try {
          return normalizeAvailabilityPayload(JSON.parse(decoded));
        } catch (error) {
          throw new Error("Formato dati non valido: impossibile effettuare il parse.");
        }
      }
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  }

  function renderPlaceholderMessage(message) {
    calendarRoot.innerHTML = `
      <div class="table-wrapper">
        <table role="presentation">
          <tbody>
            <tr>
              <td style="padding: 1.5rem; text-align: center; font-size: 1rem;">
                ${message}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function formatTimeRange(dalle, alle) {
    const from = dalle || "?";
    const to = alle || "?";
    return `${from} - ${to}`;
  }

  function compareTimes(timeA, timeB) {
    const aValue = toMinutes(timeA);
    const bValue = toMinutes(timeB);

    const aValid = Number.isFinite(aValue);
    const bValid = Number.isFinite(bValue);

    if (!aValid && !bValid) {
      return 0;
    }
    if (!aValid) {
      return 1;
    }
    if (!bValid) {
      return -1;
    }

    return aValue - bValue;
  }

  function toMinutes(timeValue) {
    if (!timeValue) {
      return Number.POSITIVE_INFINITY;
    }

    const [hours, minutes] = String(timeValue)
      .split(":")
      .map((value) => Number.parseInt(value, 10));

    if (Number.isNaN(hours)) {
      return Number.POSITIVE_INFINITY;
    }

    return hours * 60 + (Number.isNaN(minutes) ? 0 : minutes);
  }

  function decodeHtmlEntities(value) {
    const element = document.createElement("textarea");
    element.innerHTML = value;
    return element.value;
  }
})();
