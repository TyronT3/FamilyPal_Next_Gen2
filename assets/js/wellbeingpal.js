(function (global, document) {
  'use strict';

  var SYMPTOMS = [
    ['headache', 'Headache'], ['fatigue', 'Fatigue'], ['pain', 'Body pain'],
    ['stomach', 'Stomach'], ['anxiety', 'Anxiety'], ['low_mood', 'Low mood'],
    ['irritable', 'Irritable'], ['cold_flu', 'Cold / flu'], ['allergies', 'Allergies'],
    ['dizzy', 'Dizzy'], ['nausea', 'Nausea'], ['other', 'Other']
  ];
  var RATING_KEYS = ['mood', 'energy', 'stress', 'sleep', 'movement'];
  var ratings = { mood: 0, energy: 0, stress: 0, sleep: 0, movement: 0 };
  var currentUserId = null;
  var profiles = [];
  var currentProfile = null;
  var dailyLogs = [];
  var householdContext = [];
  var medications = [];
  var medicationLogs = [];
  var periodCycles = [];
  var choreLogs = [];
  var insightOwnerId = null;
  var activeTab = 'today';

  function el(id) { return document.getElementById(id); }
  function escapeHtml(value) { var div = document.createElement('div'); div.textContent = value == null ? '' : String(value); return div.innerHTML; }
  function show(id, visible) { var target = el(id); if (target) target.style.display = visible ? '' : 'none'; }
  function setError(id, message) { var target = el(id); if (target) target.textContent = message || ''; }

  function dateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function todayKey() { return dateKey(new Date()); }

  function daysAgoKey(days) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    return dateKey(date);
  }

  function timestampDateKey(value) {
    var date = new Date(value);
    return isNaN(date.getTime()) ? String(value || '').slice(0, 10) : dateKey(date);
  }

  function profileName(profile) {
    if (!profile) return 'Household member';
    return profile.display_name || (profile.role === 'wife' ? FamilyPal.profile.person2Name : FamilyPal.profile.person1Name);
  }

  function expectedName(role) {
    return role === 'wife' ? FamilyPal.profile.person2Name : FamilyPal.profile.person1Name;
  }

  function renderRatingControls() {
    document.querySelectorAll('[data-rating-group]').forEach(function (group) {
      var key = group.dataset.ratingGroup;
      var row = group.querySelector('.wb-rating');
      row.innerHTML = [1, 2, 3, 4, 5].map(function (value) {
        return '<button type="button" onclick="selectWellbeingRating(\'' + key + '\',' + value + ',this)" aria-label="' + key + ' ' + value + ' out of 5">' + value + '</button>';
      }).join('');
    });
    el('wellbeing-symptoms').innerHTML = SYMPTOMS.map(function (symptom) {
      return '<label class="wb-symptom"><input type="checkbox" value="' + symptom[0] + '"><span>' + symptom[1] + '</span></label>';
    }).join('');
  }

  function selectWellbeingRating(key, value, button) {
    ratings[key] = value;
    var group = button.closest('[data-rating-group]');
    group.querySelectorAll('button').forEach(function (candidate) { candidate.classList.toggle('selected', candidate === button); });
    el(key + '-value-label').textContent = value + ' / 5';
  }

  function setRating(key, value) {
    ratings[key] = Number(value) || 0;
    var group = document.querySelector('[data-rating-group="' + key + '"]');
    if (!group) return;
    group.querySelectorAll('button').forEach(function (button, index) { button.classList.toggle('selected', index + 1 === ratings[key]); });
    el(key + '-value-label').textContent = ratings[key] ? ratings[key] + ' / 5' : 'Choose 1–5';
  }

  function populateTodayForm() {
    var own = dailyLogs.find(function (row) { return row.owner_id === currentUserId && row.log_date === todayKey(); });
    setRating('mood', own && own.mood);
    setRating('energy', own && own.energy);
    setRating('stress', own && own.stress);
    setRating('sleep', own && own.sleep_quality);
    setRating('movement', own && own.movement);
    var selectedSymptoms = own && Array.isArray(own.symptoms) ? own.symptoms : [];
    el('wellbeing-symptoms').querySelectorAll('input').forEach(function (input) { input.checked = selectedSymptoms.includes(input.value); });

    var context = householdContext.find(function (row) { return row.context_date === todayKey(); });
    el('wellbeing-meal-source').value = context && context.meal_source || '';
    el('wellbeing-meal-balance').value = context && context.meal_balance || '';
    el('wellbeing-home-feel').value = context && context.home_feel || '';
  }

  function renderRoleSetup() {
    ['husband', 'wife'].forEach(function (role) {
      var button = el('wellbeing-role-' + role);
      var claimed = profiles.some(function (profile) { return profile.role === role && profile.owner_id !== currentUserId; });
      button.disabled = claimed;
      button.title = claimed ? 'Already connected to another FamilyPal account' : '';
    });
  }

  async function createWellbeingProfile(role, button) {
    setError('wellbeing-setup-error', '');
    if (!currentUserId) { setError('wellbeing-setup-error', 'Please sign in again.'); return; }
    if (profiles.some(function (profile) { return profile.role === role && profile.owner_id !== currentUserId; })) {
      setError('wellbeing-setup-error', 'That household role is already connected to another account.');
      return;
    }
    FamilyPalUI.setBusy(button, true, 'Connecting…');
    try {
      var rows = await FamilyPal.requestJson('/rest/v1/wellbeing_profiles', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ owner_id: currentUserId, role: role, display_name: expectedName(role) })
      });
      currentProfile = rows && rows[0];
      await loadWellbeingData();
      showMainContent();
      toast('Wellbeing profile connected');
    } catch (error) {
      setError('wellbeing-setup-error', error.message || 'Could not connect this account.');
    } finally {
      FamilyPalUI.setBusy(button, false);
    }
  }

  async function loadProfiles() {
    profiles = await FamilyPal.requestJson('/rest/v1/wellbeing_profiles?select=owner_id,role,display_name,created_at,updated_at&order=role.asc');
    currentProfile = profiles.find(function (profile) { return profile.owner_id === currentUserId; }) || null;
    if (currentProfile) {
      var name = expectedName(currentProfile.role);
      if (name && currentProfile.display_name !== name) {
        try {
          await FamilyPal.requestJson('/rest/v1/wellbeing_profiles?owner_id=eq.' + encodeURIComponent(currentUserId), {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ display_name: name, updated_at: new Date().toISOString() })
          });
          currentProfile.display_name = name;
        } catch (e) {}
      }
    }
  }

  async function loadWellbeingData() {
    var since = daysAgoKey(119);
    var sinceIso = new Date(since + 'T00:00:00').toISOString();
    var results = await Promise.all([
      FamilyPal.requestJson('/rest/v1/wellbeing_profiles?select=owner_id,role,display_name,created_at,updated_at&order=role.asc'),
      FamilyPal.requestJson('/rest/v1/wellbeing_daily_logs?log_date=gte.' + since + '&order=log_date.desc&select=*'),
      FamilyPal.requestJson('/rest/v1/wellbeing_household_context?context_date=gte.' + since + '&order=context_date.desc&select=*'),
      FamilyPal.requestJson('/rest/v1/wellbeing_medications?order=created_at.asc&select=*'),
      FamilyPal.requestJson('/rest/v1/wellbeing_medication_logs?log_date=gte.' + since + '&order=log_date.desc&select=*'),
      FamilyPal.requestJson('/rest/v1/period_cycles?start_date=gte.' + daysAgoKey(180) + '&order=start_date.asc&select=start_date,end_date'),
      FamilyPal.requestJson('/rest/v1/chore_logs?completed_at=gte.' + encodeURIComponent(sinceIso) + '&select=completed_at,completed_by,shared')
    ]);
    profiles = results[0] || [];
    currentProfile = profiles.find(function (profile) { return profile.owner_id === currentUserId; }) || currentProfile;
    dailyLogs = results[1] || [];
    householdContext = results[2] || [];
    medications = results[3] || [];
    medicationLogs = results[4] || [];
    periodCycles = results[5] || [];
    choreLogs = results[6] || [];
    if (!insightOwnerId) insightOwnerId = currentUserId;
    populateTodayForm();
    renderMedicationToday();
    renderHouseholdToday();
    renderMedicationList();
    renderInsightSelector();
    renderInsights();
  }

  function showMainContent() {
    show('wellbeing-loading', false);
    show('wellbeing-setup', false);
    show('wellbeing-tabs', true);
    show('wellbeing-content', true);
  }

  async function saveDailyCheckin(button) {
    setError('wellbeing-checkin-error', '');
    if (RATING_KEYS.some(function (key) { return !ratings[key]; })) {
      setError('wellbeing-checkin-error', 'Choose a 1–5 value for every wellbeing measure.');
      return;
    }
    var symptoms = Array.from(el('wellbeing-symptoms').querySelectorAll('input:checked')).map(function (input) { return input.value; });
    FamilyPalUI.setBusy(button, true, 'Saving…');
    try {
      await FamilyPal.requestJson('/rest/v1/wellbeing_daily_logs?on_conflict=owner_id,log_date', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          owner_id: currentUserId,
          log_date: todayKey(),
          mood: ratings.mood,
          energy: ratings.energy,
          stress: ratings.stress,
          sleep_quality: ratings.sleep,
          movement: ratings.movement,
          symptoms: symptoms,
          updated_at: new Date().toISOString()
        })
      });
      await loadWellbeingData();
      toast('Daily check-in saved');
    } catch (error) {
      setError('wellbeing-checkin-error', error.message || 'Could not save the check-in.');
    } finally {
      FamilyPalUI.setBusy(button, false);
    }
  }

  async function saveHouseholdContext(button) {
    FamilyPalUI.setBusy(button, true, 'Saving…');
    try {
      var mealBalance = parseInt(el('wellbeing-meal-balance').value, 10) || null;
      var homeFeel = parseInt(el('wellbeing-home-feel').value, 10) || null;
      await FamilyPal.requestJson('/rest/v1/wellbeing_household_context?on_conflict=context_date', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          context_date: todayKey(),
          meal_source: el('wellbeing-meal-source').value || null,
          meal_balance: mealBalance,
          home_feel: homeFeel,
          updated_by: currentUserId,
          updated_at: new Date().toISOString()
        })
      });
      await loadWellbeingData();
      toast('Household context saved');
    } catch (error) {
      toast('Could not save household context: ' + error.message);
    } finally {
      FamilyPalUI.setBusy(button, false);
    }
  }

  function medicationStatus(medicationId, date) {
    var row = medicationLogs.find(function (log) { return log.medication_id === medicationId && log.log_date === date; });
    return row ? row.status : '';
  }

  function renderMedicationToday() {
    var target = el('wellbeing-meds-today');
    var ownMeds = medications.filter(function (medication) { return medication.owner_id === currentUserId && medication.active; });
    var html = '<h2>Medication today</h2><p class="wb-intro">Mark each scheduled medication. This structured status is shared.</p>';
    if (!ownMeds.length) {
      target.innerHTML = html + '<div class="wb-empty">No active medication trackers. Add one from the Medication tab.</div>';
      return;
    }
    target.innerHTML = html + ownMeds.map(function (medication) {
      var status = medicationStatus(medication.id, todayKey());
      return '<div class="wb-med-row"><div class="wb-med-info"><div class="wb-med-name">' + escapeHtml(medication.name) + '</div><div class="wb-med-meta">' + escapeHtml(medication.dosage || 'No dose entered') + ' · ' + escapeHtml(timeLabel(medication.time_of_day)) + '</div></div><div class="wb-med-actions">' +
        '<button class="' + (status === 'taken' ? 'active-taken' : '') + '" type="button" onclick="setMedicationStatus(\'' + medication.id + '\',\'taken\')">Taken</button>' +
        '<button class="' + (status === 'missed' ? 'active-missed' : '') + '" type="button" onclick="setMedicationStatus(\'' + medication.id + '\',\'missed\')">Missed</button>' +
        '<button type="button" onclick="setMedicationStatus(\'' + medication.id + '\',\'skipped\')">Skip</button></div></div>';
    }).join('');
  }

  async function setMedicationStatus(medicationId, status) {
    try {
      await FamilyPal.requestJson('/rest/v1/wellbeing_medication_logs?on_conflict=medication_id,log_date', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ owner_id: currentUserId, medication_id: medicationId, log_date: todayKey(), status: status, logged_at: new Date().toISOString() })
      });
      await loadWellbeingData();
      toast('Medication marked ' + status);
    } catch (error) {
      toast('Could not update medication: ' + error.message);
    }
  }

  function timeLabel(value) {
    return { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', bedtime: 'Bedtime', any: 'Any time' }[value] || 'Any time';
  }

  async function addWellbeingMedication(button) {
    setError('wellbeing-med-error', '');
    var name = el('wellbeing-med-name').value.trim();
    var dosage = el('wellbeing-med-dose').value.trim();
    if (!name) { setError('wellbeing-med-error', 'Enter a medication name.'); return; }
    FamilyPalUI.setBusy(button, true, 'Adding…');
    try {
      await FamilyPal.requestJson('/rest/v1/wellbeing_medications', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ owner_id: currentUserId, name: name, dosage: dosage, time_of_day: el('wellbeing-med-time').value, active: true })
      });
      el('wellbeing-med-name').value = '';
      el('wellbeing-med-dose').value = '';
      await loadWellbeingData();
      toast('Medication tracker added');
    } catch (error) {
      setError('wellbeing-med-error', error.message || 'Could not add medication.');
    } finally {
      FamilyPalUI.setBusy(button, false);
    }
  }

  async function archiveWellbeingMedication(id) {
    var medication = medications.find(function (item) { return item.id === id && item.owner_id === currentUserId; });
    if (!medication) return;
    var confirmed = await FamilyPalUI.confirm('This will stop showing ' + medication.name + ' in daily check-ins. Existing adherence history will remain.', { title: 'Archive medication?', confirmLabel: 'Archive' });
    if (!confirmed) return;
    try {
      await FamilyPal.requestJson('/rest/v1/wellbeing_medications?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ active: false, ended_at: todayKey(), updated_at: new Date().toISOString() })
      });
      await loadWellbeingData();
      toast('Medication archived');
    } catch (error) { toast('Could not archive medication: ' + error.message); }
  }

  function renderMedicationList() {
    var target = el('wellbeing-medication-list');
    target.innerHTML = profiles.map(function (profile) {
      var rows = medications.filter(function (medication) { return medication.owner_id === profile.owner_id && medication.active; });
      return '<div class="wb-card"><h2>' + escapeHtml(profileName(profile)) + '</h2>' + (rows.length ? rows.map(function (medication) {
        return '<div class="wb-med-row"><div class="wb-med-info"><div class="wb-med-name">' + escapeHtml(medication.name) + '</div><div class="wb-med-meta">' + escapeHtml(medication.dosage || 'No dose entered') + ' · ' + escapeHtml(timeLabel(medication.time_of_day)) + '</div></div>' + (medication.owner_id === currentUserId ? '<div class="wb-med-actions"><button type="button" onclick="archiveWellbeingMedication(\'' + medication.id + '\')">Archive</button></div>' : '') + '</div>';
      }).join('') : '<div class="wb-empty">No active medication trackers.</div>') + '</div>';
    }).join('');
  }

  function renderHouseholdToday() {
    var target = el('wellbeing-household-today');
    if (!profiles.length) { target.innerHTML = '<div class="wb-empty">No wellbeing profiles yet.</div>'; return; }
    target.innerHTML = profiles.map(function (profile) {
      var row = dailyLogs.find(function (log) { return log.owner_id === profile.owner_id && log.log_date === todayKey(); });
      if (!row) return '<div class="wb-person-card"><div class="wb-person-name">' + escapeHtml(profileName(profile)) + '</div><div style="color:var(--muted);font-size:11px">No check-in yet today.</div></div>';
      return '<div class="wb-person-card"><div class="wb-person-name">' + escapeHtml(profileName(profile)) + '</div><div class="wb-person-stats">' +
        '<span>Mood<strong>' + row.mood + '/5</strong></span><span>Energy<strong>' + row.energy + '/5</strong></span>' +
        '<span>Stress<strong>' + row.stress + '/5</strong></span><span>Sleep<strong>' + row.sleep_quality + '/5</strong></span>' +
        '</div><div style="margin-top:8px;color:var(--muted);font-size:10px">' + (row.symptoms && row.symptoms.length ? row.symptoms.length + ' symptom' + (row.symptoms.length === 1 ? '' : 's') + ' selected' : 'No symptoms selected') + '</div></div>';
    }).join('');
  }

  function switchWellbeingTab(tab, button) {
    activeTab = tab;
    document.querySelectorAll('#wellbeing-tabs .tab').forEach(function (candidate) { candidate.classList.toggle('active', candidate === button); });
    ['today', 'meds', 'insights'].forEach(function (name) { show('wellbeing-tab-' + name, name === tab); });
    if (tab === 'insights') renderInsights();
  }

  function renderInsightSelector() {
    var target = el('wellbeing-insight-selector');
    target.innerHTML = profiles.map(function (profile) {
      return '<button type="button" class="' + (profile.owner_id === insightOwnerId ? 'selected' : '') + '" onclick="selectInsightPerson(\'' + profile.owner_id + '\',this)">' + escapeHtml(profileName(profile)) + '</button>';
    }).join('');
  }

  function selectInsightPerson(ownerId, button) {
    insightOwnerId = ownerId;
    button.parentElement.querySelectorAll('button').forEach(function (candidate) { candidate.classList.toggle('selected', candidate === button); });
    renderInsights();
  }

  function average(values) {
    return values.length ? values.reduce(function (sum, value) { return sum + Number(value); }, 0) / values.length : null;
  }

  function averageText(value) { return value == null ? '—' : value.toFixed(1) + '/5'; }

  function pairedRanks(values) {
    var indexed = values.map(function (value, index) { return { value: Number(value), index: index }; }).sort(function (a, b) { return a.value - b.value; });
    var ranks = new Array(values.length);
    var i = 0;
    while (i < indexed.length) {
      var end = i;
      while (end + 1 < indexed.length && indexed[end + 1].value === indexed[i].value) end++;
      var rank = (i + end + 2) / 2;
      for (var j = i; j <= end; j++) ranks[indexed[j].index] = rank;
      i = end + 1;
    }
    return ranks;
  }

  function correlation(pairs) {
    if (pairs.length < 7) return null;
    var xs = pairedRanks(pairs.map(function (pair) { return pair[0]; }));
    var ys = pairedRanks(pairs.map(function (pair) { return pair[1]; }));
    var xAvg = average(xs), yAvg = average(ys);
    var numerator = 0, xDen = 0, yDen = 0;
    xs.forEach(function (x, index) {
      var xd = x - xAvg, yd = ys[index] - yAvg;
      numerator += xd * yd;
      xDen += xd * xd;
      yDen += yd * yd;
    });
    return xDen && yDen ? numerator / Math.sqrt(xDen * yDen) : 0;
  }

  function relationshipCard(title, pairs, highText, lowText) {
    var score = correlation(pairs);
    if (score == null) return insightCard(title, 'More data needed', 'Record at least 7 days containing both measures.');
    var strength = Math.abs(score) >= 0.6 ? 'Strong pattern' : Math.abs(score) >= 0.35 ? 'Possible pattern' : 'No clear pattern yet';
    var direction = score >= 0.2 ? highText : score <= -0.2 ? lowText : 'The measures have not consistently moved together.';
    return insightCard(title, strength, direction + ' Association score: ' + score.toFixed(2) + ' across ' + pairs.length + ' days.');
  }

  function insightCard(title, result, detail) {
    return '<div class="wb-insight-card"><h3>' + escapeHtml(title) + '</h3><div class="wb-insight-result">' + escapeHtml(result) + '</div><div class="wb-insight-detail">' + escapeHtml(detail) + '</div></div>';
  }

  function comparisonCard(title, firstLabel, firstValues, secondLabel, secondValues) {
    if (firstValues.length < 3 || secondValues.length < 3) {
      return insightCard(title, 'More data needed', 'Needs at least 3 matching days in both groups. Currently ' + firstValues.length + ' and ' + secondValues.length + '.');
    }
    var first = average(firstValues), second = average(secondValues);
    var difference = first - second;
    var result = Math.abs(difference) < 0.2 ? 'About the same' : (difference > 0 ? firstLabel : secondLabel) + ' averaged higher';
    return insightCard(title, result, firstLabel + ': ' + averageText(first) + ' · ' + secondLabel + ': ' + averageText(second) + ' · Difference: ' + Math.abs(difference).toFixed(1) + '.');
  }

  function cycleContains(date, cycle) {
    var end = cycle.end_date;
    if (!end) {
      var parsed = new Date(cycle.start_date + 'T00:00:00');
      parsed.setDate(parsed.getDate() + 4);
      end = dateKey(parsed);
    }
    return date >= cycle.start_date && date <= end;
  }

  function choreCountsByDate() {
    var counts = {};
    choreLogs.forEach(function (log) {
      var key = timestampDateKey(log.completed_at);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function medicationDayStatus(ownerId, date) {
    var expected = medications.filter(function (medication) {
      return medication.owner_id === ownerId && medication.start_date <= date && (!medication.ended_at || medication.ended_at >= date);
    });
    if (!expected.length) return '';
    var expectedIds = expected.map(function (medication) { return medication.id; });
    var logs = medicationLogs.filter(function (log) { return log.owner_id === ownerId && log.log_date === date && expectedIds.includes(log.medication_id); });
    if (logs.length < expected.length) return '';
    if (logs.some(function (log) { return log.status === 'missed'; })) return 'missed';
    if (logs.every(function (log) { return log.status === 'taken'; })) return 'taken';
    return '';
  }

  function renderInsights() {
    var target = el('wellbeing-insights-content');
    var person = profiles.find(function (profile) { return profile.owner_id === insightOwnerId; });
    var logs = dailyLogs.filter(function (row) { return row.owner_id === insightOwnerId && row.log_date >= daysAgoKey(89); });
    if (!person || !logs.length) {
      target.innerHTML = '<div class="wb-card wb-empty">Add daily check-ins for this person to begin seeing patterns.</div>';
      return;
    }
    var contextByDate = {};
    householdContext.forEach(function (row) { contextByDate[row.context_date] = row; });
    var choresByDate = choreCountsByDate();
    var wife = profiles.find(function (profile) { return profile.role === 'wife'; });
    var homeMood = [], takeawayMood = [], periodMood = [], otherMood = [], takenMood = [], missedMood = [];
    var mealPairs = [], homePairs = [], chorePairs = [], sleepMoodPairs = [], movementEnergyPairs = [], stressMoodPairs = [];
    logs.forEach(function (row) {
      var context = contextByDate[row.log_date];
      if (context && context.meal_source === 'home_cooked') homeMood.push(row.mood);
      if (context && context.meal_source === 'takeaway') takeawayMood.push(row.mood);
      if (context && context.meal_balance) mealPairs.push([context.meal_balance, row.mood]);
      if (context && context.home_feel) homePairs.push([context.home_feel, row.mood]);
      if (choresByDate[row.log_date] != null) chorePairs.push([choresByDate[row.log_date], row.mood]);
      sleepMoodPairs.push([row.sleep_quality, row.mood]);
      movementEnergyPairs.push([row.movement, row.energy]);
      stressMoodPairs.push([row.stress, row.mood]);
      if (wife && periodCycles.length) {
        if (periodCycles.some(function (cycle) { return cycleContains(row.log_date, cycle); })) periodMood.push(row.mood);
        else otherMood.push(row.mood);
      }
      var medicationStatusForDay = medicationDayStatus(row.owner_id, row.log_date);
      if (medicationStatusForDay === 'taken') takenMood.push(row.mood);
      if (medicationStatusForDay === 'missed') missedMood.push(row.mood);
    });

    var html = insightCard('Data available', logs.length + ' check-in' + (logs.length === 1 ? '' : 's'), 'Using the most recent 90 days for ' + profileName(person) + '.');
    html += comparisonCard('Home-cooked meals and mood', 'Home-cooked days', homeMood, 'Takeaway days', takeawayMood);
    html += relationshipCard('Meal balance and mood', mealPairs, 'More balanced meal days tended to align with better mood.', 'More balanced meal days tended to align with lower mood.');
    html += relationshipCard('How the home feels and mood', homePairs, 'Calmer, tidier home days tended to align with better mood.', 'Calmer, tidier home days tended to align with lower mood.');
    html += relationshipCard('Chore activity and mood', chorePairs, 'Days with more completed chores tended to align with better mood.', 'Days with more completed chores tended to align with lower mood.');
    html += comparisonCard('Mood while wife is on her period', 'Period days', periodMood, 'Other days', otherMood);
    html += comparisonCard('Medication adherence and mood', 'Medication taken', takenMood, 'Medication missed', missedMood);
    html += relationshipCard('Sleep quality and mood', sleepMoodPairs, 'Better sleep tended to align with better mood.', 'Better sleep tended to align with lower mood.');
    html += relationshipCard('Movement and energy', movementEnergyPairs, 'More movement tended to align with more energy.', 'More movement tended to align with less energy.');
    html += relationshipCard('Stress and mood', stressMoodPairs, 'Higher stress tended to align with higher mood.', 'Higher stress tended to align with lower mood.');
    target.innerHTML = html;
  }

  function setupMessage(error) {
    var message = error && error.message ? error.message : 'Could not open WellbeingPal.';
    if (/wellbeing_profiles|relation|schema cache|404/i.test(message)) return 'WellbeingPal needs its Supabase migration before it can be used.';
    return message;
  }

  var toastTimer = null;
  function toast(message) {
    var target = el('toast');
    target.textContent = message;
    target.classList.add('show');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { target.classList.remove('show'); }, 2600);
  }

  async function initWellbeing() {
    if (!await FamilyPal.requireSession()) return;
    FamilyPal.startTokenRefresh();
    currentUserId = FamilyPal.getUserId();
    if (!currentUserId) {
      FamilyPal.signOut();
      return;
    }
    el('wellbeing-screen').style.display = 'flex';
    el('wellbeing-today-label').textContent = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    renderRatingControls();
    try {
      await FamilyPalUI.loadProfile();
      await loadProfiles();
      show('wellbeing-loading', false);
      if (!currentProfile) {
        renderRoleSetup();
        show('wellbeing-setup', true);
        return;
      }
      await loadWellbeingData();
      showMainContent();
    } catch (error) {
      el('wellbeing-loading').innerHTML = '<div style="color:var(--red);font-weight:750;margin-bottom:6px">WellbeingPal is not ready</div><div>' + escapeHtml(setupMessage(error)) + '</div>';
    }
  }

  global.selectWellbeingRating = selectWellbeingRating;
  global.createWellbeingProfile = createWellbeingProfile;
  global.saveDailyCheckin = saveDailyCheckin;
  global.saveHouseholdContext = saveHouseholdContext;
  global.setMedicationStatus = setMedicationStatus;
  global.addWellbeingMedication = addWellbeingMedication;
  global.archiveWellbeingMedication = archiveWellbeingMedication;
  global.switchWellbeingTab = switchWellbeingTab;
  global.selectInsightPerson = selectInsightPerson;
  global.onload = initWellbeing;
})(window, document);
