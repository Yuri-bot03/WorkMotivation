// JavaScript for real‑time earnings calculator with weekend rules and semi‑monthly pay calculations

// Compensation constants
// Updated monthly salary to reflect the user's fixed semi‑monthly pay of
// ₱14,100 per period (₱28,200 per month).  The halfSalary constant
// represents the fixed base pay for each semi‑monthly period.  The
// hourlyRate derived from the monthlySalary is still used to compute
// premiums such as night differential and overtime.
const monthlySalary = 28200;           // Monthly fixed salary (PHP)
const halfSalary = monthlySalary / 2;  // Fixed pay per semi‑monthly period (₱14,100)
const workingDaysPerMonth = 26;        // Average working days used to derive hourly rate【504998637967793†L320-L324】
const hoursPerDay = 8;                 // Standard hours for computing hourly rate
const hourlyRate = monthlySalary / workingDaysPerMonth / hoursPerDay;
const nightDiffRate = 0.18;            // Night shift premium (applies 10 PM–6 AM)
const overtimeMultiplier = 1.25;       // Weekday overtime premium【116724529657621†L175-L179】
// A de minimis allowance exists but is no longer displayed on the
// real‑time dashboard.  It is applied only in semi‑monthly calendar totals.
const deMinimisMonthly = 280
  // Semi-monthly deductions (employee share) for taxes and mandatory contributions.
// These are deducted from each semi-monthly pay period but not from daily earnings.
const annualSalary = monthlySalary * 12;
const annualTaxExcess = Math.max(annualSalary - 250000, 0);
const annualTax = annualTaxExcess * 0.15;
const semiMonthlyTax = annualTax / 24;
const monthlySSS = monthlySalary * 0.05;
const semiMonthlySSS = monthlySSS / 2;
const monthlyPhilHealthEmployee = Math.min(Math.max(monthlySalary * 0.025, 250), 1250);
const semiMonthlyPhilHealth = monthlyPhilHealthEmployee / 2;
const monthlyPagIbig = Math.min(monthlySalary * 0.02, 200);
const semiMonthlyPagIbig = monthlyPagIbig / 2;
const semiMonthlyDeductions = semiMonthlyTax + semiMonthlySSS + semiMonthlyPhilHealth + semiMonthlyPagIbig;
//
// Shift configuration
const paidShiftHours = 9;              // Total paid hours per shift (8 regular + 1 extra)
const breakDurationHours = 1;          // Unpaid break during the shift

// Grace period in minutes beyond the scheduled 8 AM end time.  If the end
// shift button is not clicked by 8:00 AM, up to this many additional
// minutes will still be counted as regular time before overtime applies.
const gracePeriodMinutes = 15;

// Variables to manage manual shift end
let shiftEnded = false;
let endedElapsedHours = 0;

// Flag to ensure automatic recording is performed only once when the page
// detects that the grace period has passed or the page is closing.  This
// prevents duplicate entries in the calendar.
let autoRecorded = false;

// Object mapping weekday dates (YYYY‑MM‑DD) to actual earnings recorded when
// the shift is ended.  This allows the calendar to display the real
// earnings for each weekday once the user clicks End Shift.  The state
// is persisted in localStorage under the key 'completedWeekdayEarnings'.
let completedWeekdayEarnings = {};

function loadCompletedWeekdayEarnings() {
  try {
    const data = localStorage.getItem('completedWeekdayEarnings');
    if (data) {
      const obj = JSON.parse(data);
      if (obj && typeof obj === 'object') {
        completedWeekdayEarnings = obj;
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
}

function saveCompletedWeekdayEarnings() {
  try {
    localStorage.setItem('completedWeekdayEarnings', JSON.stringify(completedWeekdayEarnings));
  } catch (e) {
    // Ignore storage errors
  }
}

// Object mapping weekend dates (YYYY‑MM‑DD) to work details.  Each entry
// stores { hours: number, startTime: 'HH:MM' }.  This allows spontaneous
// weekend shifts of varying length and start times.  The state is persisted
// in localStorage under the key 'workedWeekendDetails'.
let workedWeekendDetails = {};

function loadWorkedWeekendDates() {
  try {
    const data = localStorage.getItem('workedWeekendDetails');
    if (data) {
      const obj = JSON.parse(data);
      if (obj && typeof obj === 'object') {
        workedWeekendDetails = obj;
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
}

function saveWorkedWeekendDates() {
  try {
    localStorage.setItem('workedWeekendDetails', JSON.stringify(workedWeekendDetails));
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Records the final earnings for a weekday shift based on the provided
 * elapsed hours.  This helper computes base, overtime and night
 * differential using the same rules as in the updateDisplay function.
 * It caps the base hours at the maximum paid hours (including grace
 * period) and computes overtime beyond that threshold.  The result is
 * stored in the completedWeekdayEarnings object keyed by the shift
 * start date (YYYY-MM-DD) and persisted to localStorage.  This is
 * invoked either when the user clicks the "End Shift" button or
 * automatically when the grace period has passed without user
 * interaction.
 *
 * @param {Date} shiftStart - The Date when the shift began.
 * @param {number} elapsedHours - The total elapsed hours since shift start.
 */
function recordWeekdayEarnings(shiftStart, elapsedHours) {
  // Do not record for weekends; weekend work is handled manually.
  const day = shiftStart.getDay();
  if (day === 0 || day === 6) return;
  const paidHours = Math.max(elapsedHours - breakDurationHours, 0);
  const maxHours = paidShiftHours + gracePeriodMinutes / 60;
  const baseHrs = Math.min(paidHours, maxHours);
  const otHrs = Math.max(paidHours - maxHours, 0);
  // Determine which semi‑monthly period the shift falls into to compute
  // the daily base pay (halfSalary divided by the number of weekdays in
  // that period).
  const dayOfMonth = shiftStart.getDate();
  const period = dayOfMonth <= 15 ? 1 : 2;
  const year = shiftStart.getFullYear();
  const month = shiftStart.getMonth();
  const periodStart = new Date(year, month, period === 1 ? 1 : 16);
  const periodEnd = new Date(year, month, period === 1 ? 15 : new Date(year, month + 1, 0).getDate());
  const weekdayCount = getWeekdaysBetween(periodStart, periodEnd);
  const dailyBase = halfSalary / weekdayCount;
  // Weekday pay consists of the fixed daily base plus night differential
  // for the hours between 10 PM and 6 AM.  Overtime hours beyond the
  // scheduled paid hours are paid with a 25% premium on the hourly rate.
  const nightHrs = Math.min(baseHrs + otHrs, 8);
  const nightPay = hourlyRate * nightDiffRate * nightHrs;
  const otPay = hourlyRate * overtimeMultiplier * otHrs;
  const totalPay = dailyBase + nightPay + otPay;
  const dateStr = shiftStart.toISOString().split('T')[0];
  completedWeekdayEarnings[dateStr] = totalPay;
  saveCompletedWeekdayEarnings();
}

/**
 * Automatically records the shift if the user has not clicked "End Shift"
 * and the elapsed paid hours exceed the maximum paid hours allowed
 * (including grace period).  This function ensures the recording is
 * performed only once by checking the autoRecorded flag.  Overtime
 * beyond the threshold will continue to display on screen but will
 * not be included in the recorded total.
 *
 * @param {Date} shiftStart - The Date when the shift began.
 * @param {number} elapsedHours - The total elapsed hours since shift start.
 */
function autoRecordIfPastGrace(shiftStart, elapsedHours) {
  if (shiftEnded || autoRecorded) return;
  const day = shiftStart.getDay();
  // Skip weekends; weekend work is manually recorded.
  if (day === 0 || day === 6) return;
  const paidHours = Math.max(elapsedHours - breakDurationHours, 0);
  const maxHours = paidShiftHours + gracePeriodMinutes / 60;
  if (paidHours >= maxHours) {
    recordWeekdayEarnings(shiftStart, elapsedHours);
    autoRecorded = true;
  }
}

// Before the window unloads (e.g., the user closes the tab or the computer
// shuts down), automatically record the shift if it hasn't been ended.
window.addEventListener('beforeunload', () => {
  if (!shiftEnded && !autoRecorded) {
    const now = getPhilippinesTime();
    const start = getShiftStart(now);
    const elapsedHours = Math.max((now.getTime() - start.getTime()) / (1000 * 60 * 60), 0);
    autoRecordIfPastGrace(start, elapsedHours);
  }
});

/**
 * Returns the current date/time in the Asia/Manila timezone.
 * Uses Intl API to ensure calculations reflect Philippine local time.
 */
function getPhilippinesTime() {
  const now = new Date();
  const phString = now.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  return new Date(phString);
}

/**
 * Determines the start time of the current shift. Shifts begin at 10 PM and end at 8 AM.
 * If the current time is after midnight but before 8 AM, the shift started the previous day.
 */
function getShiftStart(date) {
  const start = new Date(date);
  start.setHours(22, 0, 0, 0);
  if (date.getHours() < 8) {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

/**
 * Counts weekdays (Monday through Friday) between two dates inclusive.
 */
function getWeekdaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  while (start <= end) {
    const day = start.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    start.setDate(start.getDate() + 1);
  }
  return count;
}

/**
 * Calculates semi‑monthly pay for the current month.
 * Only weekdays are included; weekend work must be tallied separately.
 * The entire de minimis allowance is added to the first pay period (1–15).
 */
function calculateSemiMonthlyPay() {
  const now = getPhilippinesTime();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Count weekdays in each period
  const weekdays1 = getWeekdaysBetween(new Date(year, month, 1), new Date(year, month, 15));
  const weekdays2 = getWeekdaysBetween(new Date(year, month, 16), new Date(year, month + 1, 0));
  // Compute daily weekday earnings (9 hours paid, night premium up to 8 hours)
  const dailyBase = hourlyRate * paidShiftHours;
  const dailyNight = hourlyRate * nightDiffRate * Math.min(paidShiftHours, 8);
  const dailyTotal = dailyBase + dailyNight;
  // Assemble semi‑monthly totals; de minimis paid in first half
  const pay1 = dailyTotal * weekdays1 + deMinimisMonthly;
  const pay2 = dailyTotal * weekdays2;
  return { pay1, pay2 };
}

/**
 * Formats a number into a Philippine peso currency string.
 */
function formatMoney(value) {
  return `₱${value.toFixed(2)}`;
}

/**
 * Returns an array of Date objects for a specified pay period in the current month.
 * period = 1 returns dates from 1st to 15th; period = 2 returns 16th to end of month.
 */
function getPayPeriodDates(period) {
  const now = getPhilippinesTime();
  const year = now.getFullYear();
  const month = now.getMonth();
  let startDay, endDay;
  if (period === 1) {
    startDay = 1;
    endDay = 15;
  } else {
    startDay = 16;
    endDay = new Date(year, month + 1, 0).getDate();
  }
  const dates = [];
  for (let day = startDay; day <= endDay; day++) {
    dates.push(new Date(year, month, day));
  }
  return dates;
}

/**
 * Computes the expected earnings for a given date based on a 9‑hour shift.
 * Applies weekend (rest‑day) multipliers for Saturdays and Sundays and
 * includes the night differential for up to 8 hours between 10 PM and 6 AM.
 */
function calculateDailyEarningsForDate(date) {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const dateStr = date.toISOString().split('T')[0];
  // Weekend dates: compute earnings only if details exist; otherwise zero
  if (isWeekend) {
    const details = workedWeekendDetails[dateStr];
    if (!details) {
      return 0;
    }
    const { hours, startTime } = details;
    return calculateWeekendEarnings(hours, startTime);
  }
  // Weekday dates: if an actual shift has been recorded via the End Shift
  // button or automatic recording, return that recorded value.  Otherwise
  // compute the expected daily earnings by dividing the fixed semi‑monthly
  // salary across the number of weekdays in the appropriate pay period.
  if (completedWeekdayEarnings.hasOwnProperty(dateStr)) {
    return completedWeekdayEarnings[dateStr];
  }
  // Determine which semi‑monthly period this date falls into.
  const dayOfMonth = date.getDate();
  const period = dayOfMonth <= 15 ? 1 : 2;
  const year = date.getFullYear();
  const month = date.getMonth();
  const periodStart = new Date(year, month, period === 1 ? 1 : 16);
  const periodEnd = new Date(year, month, period === 1 ? 15 : new Date(year, month + 1, 0).getDate());
  const weekdayCount = getWeekdaysBetween(periodStart, periodEnd);
  // Spread the fixed half‑salary evenly across the weekdays of the period.
  const dailyBase = halfSalary / weekdayCount;
  // Expected night differential for a full shift: 18% of the hourly rate
  // applied to the hours between 10 PM and 6 AM (8 hours).  Overtime and
  // mid‑shift premiums are not included here because the base pay already
  // accounts for the 9 paid hours.
  const nightHoursForDaily = Math.min(paidShiftHours, 8);
  const night = hourlyRate * nightDiffRate * nightHoursForDaily;
  return dailyBase + night;
}

/**
 * Calculates the earnings for a weekend (rest‑day) shift given the
 * number of hours worked and the start time (HH:MM in 24‑hour format).
 * Rest‑day pay rules: the first 8 hours are paid at 130% of the
 * hourly rate, and any hours beyond 8 are paid at 169%【997854114004205†L460-L472】.
 * Night differential (18% of hourly rate) applies to hours worked
 * between 10 PM and 6 AM.  This function uses calculateNightHours() to
 * determine the number of hours in that window.
 *
 * @param {number} hours - Total hours worked on the rest day.
 * @param {string} startTime - Shift start time in HH:MM, 24‑hour format.
 * @returns {number} Total earnings for the weekend shift.
 */
function calculateWeekendEarnings(hours, startTime) {
  const weekendBaseHours = Math.min(hours, 8);
  const weekendExtraHours = Math.max(hours - 8, 0);
  const basePay = hourlyRate * 1.3 * weekendBaseHours + hourlyRate * 1.69 * weekendExtraHours;
  const nightHours = calculateNightHours(hours, startTime);
  const nightPay = hourlyRate * nightDiffRate * nightHours;
  return basePay + nightPay;
}

/**
 * Calculates the number of hours within a given shift that fall into
 * the night differential period (10:00 PM to 6:00 AM).  The function
 * handles shifts that may start before midnight and continue past it,
 * or begin after midnight in the early morning.  It assumes the
 * provided start time is on the same day as the weekend shift.
 *
 * @param {number} hours - Length of the shift in hours.
 * @param {string} startTime - Start time in HH:MM, 24‑hour format.
 * @returns {number} Total hours of the shift that qualify for the night differential.
 */
function calculateNightHours(hours, startTime) {
  const parts = startTime.split(':');
  let startH = parseInt(parts[0], 10);
  let startM = parseInt(parts[1], 10);
  if (isNaN(startH) || isNaN(startM)) return 0;
  const startMinutes = startH * 60 + startM;
  const endMinutes = startMinutes + hours * 60;
  let nightMinutes = 0;
  // Calculate overlap with 10 PM (22:00) to midnight (24:00) on the start day.
  const nightStart1 = 22 * 60; // 1320
  const nightEnd1 = 24 * 60;   // 1440
  const day1End = Math.min(endMinutes, 1440);
  nightMinutes += Math.max(0, Math.min(day1End, nightEnd1) - Math.max(startMinutes, nightStart1));
  // Calculate overlap with midnight to 6 AM on the start or next day.
  const nightStart2 = 0;
  const nightEnd2 = 6 * 60; // 360
  if (endMinutes > 1440) {
    // Shift crosses midnight; compute minutes in next day
    const minutesPastMidnight = endMinutes - 1440;
    nightMinutes += Math.max(0, Math.min(minutesPastMidnight, nightEnd2) - nightStart2);
    // If startMinutes < 360 (i.e., shift started in early morning), also add overlap on the start day
    if (startMinutes < nightEnd2) {
      nightMinutes += Math.min(nightEnd2, day1End) - startMinutes;
    }
  } else {
    // Shift does not cross midnight but may start in early morning
    if (startMinutes < nightEnd2) {
      nightMinutes += Math.max(0, Math.min(endMinutes, nightEnd2) - startMinutes);
    }
  }
  return nightMinutes / 60;
}

/**
 * Renders a simple calendar for the current pay period.  The calendar shows
 * day numbers in a grid starting on Monday and includes day‑of‑week labels.
 * Hovering over a day will display a tooltip with the estimated earnings
 * calculated via calculateDailyEarningsForDate().  The current day is
 * highlighted.
 */
function renderCalendar(period, titleId, gridId, totalId) {
  const calendarGrid = document.getElementById(gridId);
  const calendarTitleEl = document.getElementById(titleId);
  const totalEl = document.getElementById(totalId);
  if (!calendarGrid || !calendarTitleEl || !totalEl) return;
  const dates = getPayPeriodDates(period);
  if (dates.length === 0) return;
  const firstDate = dates[0];
  const options = { month: 'long', year: 'numeric' };
  calendarTitleEl.textContent = firstDate.toLocaleDateString('en-US', options);
  calendarGrid.innerHTML = '';
  // Day labels
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  dayNames.forEach(name => {
    const label = document.createElement('div');
    label.className = 'day-label';
    label.textContent = name;
    calendarGrid.appendChild(label);
  });
  // Offset for alignment (Monday as first column)
  const offset = (firstDate.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day';
    empty.style.visibility = 'hidden';
    calendarGrid.appendChild(empty);
  }
  const today = getPhilippinesTime();
  let periodTotal = 0;
  dates.forEach(dateObj => {
    const dateStr = dateObj.toISOString().split('T')[0];
    const earnings = calculateDailyEarningsForDate(dateObj);
    periodTotal += earnings;
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    // Highlight current day
    if (dateObj.toDateString() === today.toDateString()) {
      cell.classList.add('today');
    }
    // Mark weekend cells that are worked (i.e., have details)
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    if (isWeekend && workedWeekendDetails[dateStr]) {
      cell.classList.add('worked');
    }
    cell.textContent = dateObj.getDate();
    cell.dataset.date = dateStr;
    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.textContent = `₱${earnings.toFixed(2)}`;
    cell.appendChild(tooltip);
    // Click handler to manage weekend work details.  When a weekend cell
    // is clicked, prompt the user to enter the number of hours worked and
    // the shift start time.  Leaving the hours blank will remove the entry.
    if (isWeekend) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        const existing = workedWeekendDetails[dateStr];
        let hours, startTime;
        if (existing) {
          // If already present, ask if the user wants to remove or update
          const remove = window.confirm('This weekend entry is already recorded. Click OK to remove it, or Cancel to edit the details.');
          if (remove) {
            delete workedWeekendDetails[dateStr];
            saveWorkedWeekendDates();
            renderCalendars();
            return;
          } else {
            hours = prompt('Enter hours worked for ' + dateStr + ' (e.g., 5.5):', existing.hours);
            if (hours === null) return; // Cancel editing
            hours = parseFloat(hours);
            if (isNaN(hours) || hours <= 0) {
              alert('Invalid hours. Please enter a positive number.');
              return;
            }
            startTime = prompt('Enter shift start time (HH:MM, 24‑hour) for ' + dateStr + ':', existing.startTime);
            if (startTime === null) return;
            // Basic validation of HH:MM
            if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
              alert('Invalid time format. Please use HH:MM in 24‑hour format.');
              return;
            }
          }
        } else {
          hours = prompt('Enter hours worked for ' + dateStr + ' (e.g., 5.5):', '8');
          if (hours === null) return;
          hours = parseFloat(hours);
          if (isNaN(hours) || hours <= 0) {
            alert('Invalid hours. Please enter a positive number.');
            return;
          }
          startTime = prompt('Enter shift start time (HH:MM, 24‑hour) for ' + dateStr + ':', '08:00');
          if (startTime === null) return;
          if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
            alert('Invalid time format. Please use HH:MM in 24‑hour format.');
            return;
          }
        }
        // Save updated details
        workedWeekendDetails[dateStr] = { hours, startTime };
        saveWorkedWeekendDates();
        renderCalendars();
      });
    }
    calendarGrid.appendChild(cell);
  });
  // Add the de minimis allowance to the first pay period total.  The
  // calendar cells already incorporate the fixed semi‑monthly salary on a
  // per‑weekday basis, so there is no need to adjust the base pay here.
      if (period === 1) {
      periodTotal += deMinimisMonthly;
    }
    // Subtract semi-monthly deductions (employee share) and compute net pay for this period
    const netTotal = periodTotal - semiMonthlyDeductions;
    // Update total display for this period with net pay
    totalEl.textContent = String.fromCharCode(8369) + netTotal.toFixed(2);

}

/**
 * Render both semi‑monthly calendars.  This function reads the list of worked
 * weekend dates from localStorage, then regenerates each calendar and
 * updates the period totals.
 */
function renderCalendars() {
  // Load persisted data for weekend work and completed weekday earnings
  loadWorkedWeekendDates();
  loadCompletedWeekdayEarnings();
  renderCalendar(1, 'calendar-title-1', 'calendar-grid-1', 'period-total-1');
  renderCalendar(2, 'calendar-title-2', 'calendar-grid-2', 'period-total-2');
}

/**
 * Updates the real‑time earnings display. Detects weekend shifts and applies rest‑day rules.
 */
function updateDisplay() {
  const now = getPhilippinesTime();
  const shiftStart = getShiftStart(now);
  // Elapsed hours since shift start (in Philippine time)
  const elapsedHours = Math.max((now.getTime() - shiftStart.getTime()) / (1000 * 60 * 60), 0);
  // Freeze elapsed hours when shift is manually ended
  const effectiveElapsedHours = shiftEnded ? endedElapsedHours : elapsedHours;
  // Subtract unpaid break
  const paidHoursWorked = Math.max(effectiveElapsedHours - breakDurationHours, 0);
  // Allow a grace period beyond the scheduled 9 paid hours before overtime applies
  const maxPaidHoursNoOT = paidShiftHours + gracePeriodMinutes / 60;
  const baseHours = Math.min(paidHoursWorked, maxPaidHoursNoOT);
  const overtimeHours = Math.max(paidHoursWorked - maxPaidHoursNoOT, 0);
  // Detect if the shift started on a weekend (Saturday or Sunday)
  const isWeekend = shiftStart.getDay() === 0 || shiftStart.getDay() === 6;
  let baseEarnings;
  let overtimeEarnings;
  if (isWeekend) {
    // Rest‑day pay: first 8 hours at 130%, hours beyond 8 at 169%
    const weekendBaseHours = Math.min(baseHours, 8);
    const weekendExtraHours = Math.max(baseHours - 8, 0);
    baseEarnings = hourlyRate * 1.3 * weekendBaseHours + hourlyRate * 1.69 * weekendExtraHours;
    // Overtime beyond the nine paid hours (if any) at 169%
    overtimeEarnings = hourlyRate * 1.69 * overtimeHours;
  } else {
    // Weekday pay: all paid hours at regular rate; overtime at 25% premium
    baseEarnings = hourlyRate * baseHours;
    overtimeEarnings = hourlyRate * overtimeMultiplier * overtimeHours;
  }
  // Night shift premium applies up to 8 hours of work between 10 PM and 6 AM
  const nightHours = Math.min(baseHours + overtimeHours, 8);
  const nightEarnings = hourlyRate * nightDiffRate * nightHours;
  // Mid shift premium is zero for this schedule
  const midEarnings = 0;
  // De minimis allowance is not accrued during the shift
  const allowanceEarnings = 0;
  // Total earnings
  const total = baseEarnings + nightEarnings + midEarnings + overtimeEarnings + allowanceEarnings;
  // Format time worked
  const displayHours = Math.floor(paidHoursWorked);
  const displayMinutes = Math.floor(((paidHoursWorked * 3600) % 3600) / 60);
  const displaySeconds = Math.floor((paidHoursWorked * 3600) % 60);
  // Update DOM elements
  document.getElementById('time-worked').textContent = `${displayHours}h ${displayMinutes}m ${displaySeconds}s`;
  document.getElementById('base-earnings').textContent = formatMoney(baseEarnings);
  document.getElementById('night-earnings').textContent = formatMoney(nightEarnings);
  document.getElementById('mid-earnings').textContent = formatMoney(midEarnings);
  document.getElementById('ot-earnings').textContent = formatMoney(overtimeEarnings);
  // Update DOM elements (allowance and semi‑monthly metrics have been removed)
  document.getElementById('total-earnings').textContent = formatMoney(total);

  // After updating the display, check if the shift has exceeded the
  // allowed paid hours without an explicit end. If so, automatically
  // record the shift once.  This ensures that if the user forgets to
  // click "End Shift" and continues working, the earnings for the
  // scheduled portion of the shift (including grace period) are still
  // captured in the calendar.  Overtime beyond this threshold will
  // continue to accumulate on screen but will not affect the recorded
  // weekday earnings.
  autoRecordIfPastGrace(shiftStart, effectiveElapsedHours);
}

// Initialize display and update every second
// Call updateDisplay immediately and then every second.  The update
// function also invokes autoRecordIfPastGrace() to handle automatic
// recording of shifts when appropriate.
updateDisplay();
setInterval(updateDisplay, 1000);

/**
 * Event listener for the "End Shift" button. Records the elapsed hours
 * at the moment of clicking, freezes updates, and disables the button.
 */
document.addEventListener('DOMContentLoaded', () => {
  const endShiftBtn = document.getElementById('end-shift-btn');
  if (endShiftBtn) {
    endShiftBtn.addEventListener('click', () => {
      if (!shiftEnded) {
        const now = getPhilippinesTime();
        const start = getShiftStart(now);
        // Record elapsed hours up to this moment
        endedElapsedHours = Math.max((now.getTime() - start.getTime()) / (1000 * 60 * 60), 0);
        shiftEnded = true;
        endShiftBtn.disabled = true;
        // Compute final earnings for the shift and record them for the calendar if it is a weekday
        const paidHours = Math.max(endedElapsedHours - breakDurationHours, 0);
        const maxHours = paidShiftHours + gracePeriodMinutes / 60;
        const baseHrs = Math.min(paidHours, maxHours);
        const otHrs = Math.max(paidHours - maxHours, 0);
        const weekend = start.getDay() === 0 || start.getDay() === 6;
        let basePay, otPay;
        if (weekend) {
          // Rest‑day pay: first 8 hours at 130%, beyond 8 at 169%
          const weekendBaseHours = Math.min(baseHrs, 8);
          const weekendExtraHours = Math.max(baseHrs - 8, 0);
          basePay = hourlyRate * 1.3 * weekendBaseHours + hourlyRate * 1.69 * weekendExtraHours;
          otPay = hourlyRate * 1.69 * otHrs;
        } else {
          basePay = hourlyRate * baseHrs;
          otPay = hourlyRate * overtimeMultiplier * otHrs;
        }
        const nightHrs = Math.min(baseHrs + otHrs, 8);
        const nightPay = hourlyRate * nightDiffRate * nightHrs;
        const midPay = 0;
        const totalPay = basePay + nightPay + midPay + otPay;
        // Record earnings only for weekday dates; weekend days are handled via manual entry
        if (!weekend) {
          const dateStr = start.toISOString().split('T')[0];
          completedWeekdayEarnings[dateStr] = totalPay;
          saveCompletedWeekdayEarnings();
        }
        // Re-render calendars to reflect recorded earnings
        renderCalendars();
      }
    });
  }

  // Load worked weekend dates from storage and render both pay‑period calendars
  loadWorkedWeekendDates();
  renderCalendars();
});
