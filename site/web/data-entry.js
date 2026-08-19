/**
 * Standalone external IEP goal progress data entry.
 *
 * The URL token is sent only to the server-backed data-entry endpoint.
 * The browser never reads or writes Supabase tables directly.
 */

(async () => {
  "use strict";

  const {
    getCurrentQuarter,
    getQuarterDateRange,
  } =
    await import(
      '/web/quarter-utils.js'
    );

  let tokenValue = '';
  let tokenData = null;
  let goalData = null;
  let studentData = null;
  let progressEntries = [];
  let currentQuarter = null;

  const $ =
    id =>
      document.getElementById(id);

  const deLoading = $('deLoading');
  const deContent = $('deContent');
  const deAlert = $('deAlert');
  const deForm = $('deForm');
  const deStudentCode = $('deStudentCode');
  const deGoalCode = $('deGoalCode');
  const deGoalArea = $('deGoalArea');
  const deMeasurementType =
    $('deMeasurementType');
  const deGoalDesc = $('deGoalDesc');
  const deDataCollector =
    $('deDataCollector');
  const deDate = $('deDate');
  const dePercent = $('dePercent');
  const dePercentGroup =
    $('dePercentGroup');
  const deXofYGroup = $('deXofYGroup');
  const deXofYNum = $('deXofYNum');
  const deXofYDenom = $('deXofYDenom');
  const deNotes = $('deNotes');
  const deSubmitBtn = $('deSubmitBtn');
  const deProgressList =
    $('deProgressList');
  const deProgressSummary =
    $('deProgressSummary');
  const deAvgValue = $('deAvgValue');
  const deTrend = $('deTrend');

  function showAlert(
    message,
    type = 'info',
  ) {
    deAlert.textContent = message;
    deAlert.className =
      `de-alert ${type}`;
    deAlert.style.display = 'block';

    if (type === 'success') {
      setTimeout(
        () => {
          deAlert.style.display =
            'none';
        },
        5000,
      );
    }
  }

  function hideAlert() {
    deAlert.style.display = 'none';
  }

  function isXOfYMeasurementType(value) {
    const normalized =
      String(value || '')
        .trim()
        .toLowerCase();

    return (
      normalized === 'x/y' ||
      normalized === 'x_of_y'
    );
  }

  function formatDate(dateStr) {
    const date =
      new Date(
        `${dateStr}T12:00:00`,
      );

    return date.toLocaleDateString(
      'en-US',
      {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      },
    );
  }

  function formatDateYYYYMMDD(
    date = new Date(),
  ) {
    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1,
      ).padStart(2, '0');

    const day =
      String(
        date.getDate(),
      ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function getTokenFromURL() {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    return params.get('token') || '';
  }

  function buildLoadUrl() {
    const params =
      new URLSearchParams({
        token: tokenValue,
      });

    if (
      currentQuarter?.startDate &&
      currentQuarter?.endDate
    ) {
      params.set(
        'start_date',
        formatDateYYYYMMDD(
          currentQuarter.startDate,
        ),
      );

      params.set(
        'end_date',
        formatDateYYYYMMDD(
          currentQuarter.endDate,
        ),
      );
    }

    return (
      '/.netlify/functions/' +
      'data-entry-access?' +
      params.toString()
    );
  }

  async function loadContext() {
    const response =
      await fetch(
        buildLoadUrl(),
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            Accept:
              'application/json',
          },
        },
      );

    const result =
      await response
        .json()
        .catch(() => ({
          ok: false,
        }));

    if (
      !response.ok ||
      !result.ok
    ) {
      const error =
        new Error(
          result.error ||
          'This link is unavailable',
        );

      error.status =
        response.status;

      throw error;
    }

    tokenData =
      result.token || null;

    studentData =
      result.student || null;

    goalData =
      result.goal || null;

    progressEntries =
      Array.isArray(result.progress)
        ? result.progress
        : [];

    return Boolean(
      tokenData &&
      studentData &&
      goalData,
    );
  }

  function render() {
    deStudentCode.textContent =
      tokenData.student_code;

    deGoalCode.textContent =
      tokenData.goal_code;

    deGoalArea.textContent =
      goalData.goal_area ||
      'Uncategorized';

    deMeasurementType.textContent =
      isXOfYMeasurementType(
        goalData.measurement_type,
      )
        ? 'X out of Y'
        : 'Percent';

    deGoalDesc.textContent =
      goalData.desc ||
      'No description available';

    deDataCollector.textContent =
      tokenData.data_collector ||
      'Unknown';

    if (
      isXOfYMeasurementType(
        goalData.measurement_type,
      )
    ) {
      dePercentGroup.style.display =
        'none';

      deXofYGroup.style.display =
        'block';

      dePercent.removeAttribute(
        'required',
      );

      deXofYNum.setAttribute(
        'required',
        'required',
      );

      deXofYDenom.setAttribute(
        'required',
        'required',
      );
    } else {
      dePercentGroup.style.display =
        'block';

      deXofYGroup.style.display =
        'none';

      dePercent.setAttribute(
        'required',
        'required',
      );

      deXofYNum.removeAttribute(
        'required',
      );

      deXofYDenom.removeAttribute(
        'required',
      );
    }

    deDate.value =
      formatDateYYYYMMDD();

    renderProgressEntries();
  }

  function renderProgressEntries() {
    deProgressList.textContent = '';

    if (
      progressEntries.length === 0
    ) {
      const empty =
        document.createElement('li');

      empty.className = 'de-empty';
      empty.textContent =
        'No entries yet this quarter.';

      deProgressList.appendChild(
        empty,
      );

      deProgressSummary.style.display =
        'none';

      return;
    }

    for (
      const entry
      of progressEntries
    ) {
      const item =
        document.createElement('li');

      item.className =
        'de-progress-item';

      const date =
        document.createElement('span');

      date.className =
        'de-progress-date';

      date.textContent =
        `${formatDate(entry.date)}:`;

      const details =
        document.createElement('span');

      const value =
        document.createElement('span');

      value.className =
        'de-progress-value';

      value.textContent =
        `${Number(entry.value).toFixed(0)}%`;

      const collector =
        document.createElement('span');

      collector.className =
        'de-progress-by';

      collector.textContent =
        ` (by ${
          entry.collected_by ||
          tokenData.data_collector ||
          'Unknown'
        })`;

      details.append(
        value,
        collector,
      );

      item.append(
        date,
        details,
      );

      deProgressList.appendChild(
        item,
      );
    }

    const sum =
      progressEntries.reduce(
        (total, entry) =>
          total +
          Number(entry.value || 0),
        0,
      );

    const average =
      (
        sum /
        progressEntries.length
      ).toFixed(0);

    deAvgValue.textContent =
      average;

    let trend = '→';

    if (
      progressEntries.length >= 2
    ) {
      const sorted =
        [...progressEntries].sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date),
        );

      const midpoint =
        Math.floor(
          sorted.length / 2,
        );

      const firstHalf =
        sorted.slice(
          0,
          midpoint,
        );

      const secondHalf =
        sorted.slice(
          midpoint,
        );

      const firstAverage =
        firstHalf.reduce(
          (total, entry) =>
            total +
            Number(entry.value || 0),
          0,
        ) /
        firstHalf.length;

      const secondAverage =
        secondHalf.reduce(
          (total, entry) =>
            total +
            Number(entry.value || 0),
          0,
        ) /
        secondHalf.length;

      if (
        secondAverage >
        firstAverage + 5
      ) {
        trend = '↗';
      } else if (
        secondAverage <
        firstAverage - 5
      ) {
        trend = '↘';
      }
    }

    deTrend.textContent =
      trend;

    deProgressSummary.style.display =
      'flex';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    hideAlert();

    const date =
      deDate.value;

    let value = null;

    if (
      isXOfYMeasurementType(
        goalData.measurement_type,
      )
    ) {
      const numerator =
        Number(
          deXofYNum.value,
        );

      const denominator =
        Number(
          deXofYDenom.value,
        );

      if (
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        numerator < 0 ||
        denominator <= 0 ||
        numerator > denominator
      ) {
        showAlert(
          'Please enter a valid score.',
          'error',
        );

        return;
      }

      value =
        numerator /
        denominator *
        100;
    } else {
      value =
        Number(
          dePercent.value,
        );

      if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      ) {
        showAlert(
          'Please enter a valid percentage between 0 and 100.',
          'error',
        );

        return;
      }
    }

    const notes =
      deNotes.value.trim();

    deSubmitBtn.disabled = true;
    deSubmitBtn.textContent =
      'Saving...';

    try {
      const response =
        await fetch(
          '/.netlify/functions/data-entry-access',
          {
            method: 'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body:
              JSON.stringify({
                token: tokenValue,
                date,
                value:
                  Math.round(
                    value * 100,
                  ) / 100,
                notes,
              }),
          },
        );

      const result =
        await response
          .json()
          .catch(() => ({
            ok: false,
          }));

      if (
        !response.ok ||
        !result.ok
      ) {
        throw new Error(
          result.error ||
          'Could not save',
        );
      }

      showAlert(
        '✅ Success! Data point saved.',
        'success',
      );

      deForm.reset();

      deDate.value =
        formatDateYYYYMMDD();

      await loadContext();
      renderProgressEntries();
    } catch (error) {
      console.error(
        '[data-entry] Save failed:',
        error,
      );

      showAlert(
        'Could not save. Please check your connection and try again.',
        'error',
      );
    } finally {
      deSubmitBtn.disabled =
        false;

      deSubmitBtn.textContent =
        '✅ Submit Data Point';
    }
  }

  async function init() {
    tokenValue =
      getTokenFromURL().trim();

    if (!tokenValue) {
      deLoading.style.display =
        'none';

      showAlert(
        'No token provided. Please use the link sent to you.',
        'error',
      );

      return;
    }

    const quarter =
      getCurrentQuarter();

    const range =
      getQuarterDateRange(
        quarter,
      );

    currentQuarter = {
      quarter,
      startDate:
        range?.start || null,
      endDate:
        range?.end || null,
    };

    try {
      const loaded =
        await loadContext();

      if (!loaded) {
        throw new Error(
          'Incomplete link context',
        );
      }

      deLoading.style.display =
        'none';

      deContent.style.display =
        'block';

      render();

      deForm.addEventListener(
        'submit',
        handleSubmit,
      );
    } catch (error) {
      console.error(
        '[data-entry] Initialization failed:',
        error,
      );

      deLoading.style.display =
        'none';

      showAlert(
        'This link is no longer valid. Please contact the teacher for a new link.',
        'error',
      );
    }
  }

  init();
})();
