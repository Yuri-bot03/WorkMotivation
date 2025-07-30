// JavaScript for real‑time earnings calculator with weekend rules and semi‑monthly pay calculations

// Compensation constants
const monthlySalary = 28000;           // Monthly fixed salary (PHP)
const workingDaysPerMonth = 26;        // Average working days used to derive hourly rate【504998637967793†L320-L324】
const hoursPerDay = 8;                 // Standard hours for computing hourly rate
const hourlyRate = monthlySalary / workingDaysPerMonth / hoursPerDay;
const nightDiffRate = 0.18;            // Night shift premium (applies 10 PM–6 AM)
const overtimeMultiplier = 1.25;       // Weekday overtime premium【116724529657621†L175-L179】
const deMinimisMonthly = 2800;         // De minimis allowance (paid on the 15th)

// Shift configuration
const paidShiftHours = 9;              // Total paid hours per shift (8 regular + 1 extra)
const breakDurationHours = 1;          // Unpaid break during the shift

// Variables to manage manual shift end
let shiftEnded = false;
let endedElapsedHours = 0;

// Set of weekend dates (YYYY‑MM‑DD strings) that have been marked as worked.
// This allows spontaneous weekend work to be toggled on the calendar.  The
// state is persisted in localStorage under the key 'workedWeekendDates'.
let workedWeekendSet = new Set();

function loadWorkedWeekendDates() {
  try {
    const data = localStorage.getItem('workedWeekendDates');
    if (data) {
      const arr = JSON.parse(data);
      if (Array.isArray(arr)) {
        workedWeekendSet = new Set(arr);
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
}

function saveWorkedWeekendDates() {
  try {
    const arr = Array.from(workedWeekendSet);
    localStorage.setItem('workedWeekendDates', JSON.stringify(arr));
  } catch (e) {
    // Ignore storage errors
  }
}

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
  // If weekend and not marked as worked, earnings are zero
  if (isWeekend && !workedWeekendSet.has(dateStr)) {
    return 0;
  }
  let base;
  if (isWeekend) {
    const weekendBaseHours = Math.min(paidShiftHours, 8);
    const weekendExtraHours = Math.max(paidShiftHours - 8, 0);
    base = hourlyRate * 1.3 * weekendBaseHours + hourlyRate * 1.69 * weekendExtraHours;
  } else {
    base = hourlyRate * paidShiftHours;
  }
  const nightHoursForDaily = Math.min(paidShiftHours, 8);
  const night = hourlyRate * nightDiffRate * nightHoursForDaily;
  return base + night;
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
    // Mark weekend cells that are worked
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    if (isWeekend && workedWeekendSet.has(dateStr)) {
      cell.classList.add('worked');
    }
    cell.textContent = dateObj.getDate();
    cell.dataset.date = dateStr;
    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.textContent = `₱${earnings.toFixed(2)}`;
    cell.appendChild(tooltip);
    // Click handler to toggle weekend work
    if (isWeekend) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        if (workedWeekendSet.has(dateStr)) {
          workedWeekendSet.delete(dateStr);
        } else {
          workedWeekendSet.add(dateStr);
        }
        saveWorkedWeekendDates();
        renderCalendars();
      });
    }
    calendarGrid.appendChild(cell);
  });
  // Update total display for this period
  totalEl.textContent = `₱${periodTotal.toFixed(2)}`;
}

/**
 * Render both semi‑monthly calendars.  This function reads the list of worked
 * weekend dates from localStorage, then regenerates each calendar and
 * updates the period totals.
 */
function renderCalendars() {
  // Ensure workedWeekendSet is initialized from storage
  loadWorkedWeekendDates();
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
  // Determine base and overtime hours relative to the scheduled paid shift
  const baseHours = Math.min(paidHoursWorked, paidShiftHours);
  const overtimeHours = Math.max(paidHoursWorked - paidShiftHours, 0);
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
  document.getElementById('allowance-earnings').textContent = formatMoney(allowanceEarnings);
  document.getElementById('total-earnings').textContent = formatMoney(total);
  // Update semi‑monthly pay display
  const { pay1, pay2 } = calculateSemiMonthlyPay();
  document.getElementById('semi-1').textContent = formatMoney(pay1);
  document.getElementById('semi-2').textContent = formatMoney(pay2);
}

// Initialize display and update every second
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
        endedElapsedHours = Math.max((now.getTime() - start.getTime()) / (1000 * 60 * 60), 0);
        shiftEnded = true;
        endShiftBtn.disabled = true;
      }
    });
  }

  // Load worked weekend dates from storage and render both pay‑period calendars
  loadWorkedWeekendDates();
  renderCalendars();
});