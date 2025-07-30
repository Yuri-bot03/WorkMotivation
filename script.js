// JavaScript for the real‑time earnings calculator

// Constants based on the user's compensation details
const monthlySalary = 28000;           // Monthly fixed salary in Philippine pesos
const workingDaysPerMonth = 26;        // Government guideline: average working days per month【504998637967793†L320-L324】
const hoursPerDay = 8;                 // Standard working hours per day【504998637967793†L320-L324】
const hourlyRate = monthlySalary / workingDaysPerMonth / hoursPerDay;
const nightDiffRate = 0.18;            // 18% night shift premium (company policy)
const midShiftRate = 0.14;             // 14% mid shift premium for 6 PM–10 PM window
const overtimeMultiplier = 1.25;       // 25% overtime premium for regular weekdays【116724529657621†L175-L179】

// De minimis allowance: PHP 2,800 provided on the 15th of each month.  Distribute
// evenly across working days to compute a per‑day amount.  The workingDaysPerMonth
// constant above (26) is used here as an estimate of average workdays in a month【997854114004205†L460-L472】.
const deMinimisMonthly = 2800;
const deMinimisPerDay = deMinimisMonthly / workingDaysPerMonth;
// For a nine‑hour shift, spread the daily allowance across all seconds of the shift
const shiftLengthHours = 9;
const allowancePerSecond = deMinimisPerDay / (shiftLengthHours * 3600);

/**
 * Returns the current time in the Asia/Manila timezone.
 * This helper uses the browser's Intl API to convert the current
 * date/time into a string representing the time in Asia/Manila and
 * then converts it back into a Date object. This ensures the
 * calculations are based on Philippine local time regardless of
 * the user's browser locale.
 */
function getPhilippinesTime() {
  const now = new Date();
  // Create a locale string in the desired timezone
  const phString = now.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  return new Date(phString);
}

/**
 * Determines the start time of the current shift. The user's shift
 * always begins at 10:00 PM and ends at 8:00 AM the following day.
 * If the current time is between midnight and 7:59 AM, the shift start
 * is considered to be 10:00 PM of the previous day. Otherwise, the
 * shift start is 10:00 PM of the current day.
 *
 * @param {Date} date - A date/time in the Asia/Manila timezone
 * @returns {Date} A Date object representing the start of the shift
 */
function getShiftStart(date) {
  const shiftStart = new Date(date);
  shiftStart.setHours(22, 0, 0, 0); // set to 10:00 PM
  if (date.getHours() < 8) {
    // If it's after midnight but before 8 AM, the shift started yesterday
    shiftStart.setDate(shiftStart.getDate() - 1);
  }
  return shiftStart;
}

/**
 * Computes earnings based on the total seconds worked so far.
 * The first eight hours are considered regular hours and receive
 * both the base pay and the night shift premium. Any time beyond
 * eight hours is paid at the overtime rate. Night shift premiums
 * are not applied to overtime hours after 6:00 AM.
 *
 * @param {number} secondsWorked - Total seconds worked since shift start
 * @returns {Object} Breakdown of earnings: base, night, overtime, total
 */
function calculateEarnings(secondsWorked) {
  // Cap the base portion at 8 hours (28,800 seconds)
  const baseSeconds = Math.min(secondsWorked, 8 * 3600);
  const otSeconds = Math.max(secondsWorked - 8 * 3600, 0);

  // Convert seconds to hours for easier calculation
  const baseHours = baseSeconds / 3600;
  const otHours = otSeconds / 3600;

  // Base earnings for regular hours
  const baseEarnings = hourlyRate * baseHours;
  // Night shift premium applies during regular hours (10 PM–6 AM)
  const nightEarnings = hourlyRate * nightDiffRate * baseHours;
  // Mid shift premium applies for work rendered between 6 PM and 10 PM.  Since
  // the user’s shift starts at 10 PM, there are usually zero mid‑shift hours.
  // This placeholder computes the premium by multiplying the hourly rate by
  // the mid‑shift rate and the number of mid‑shift hours.  For flexibility,
  // you could extend this logic to compute overlapping hours dynamically.
  const midShiftHours = 0;
  const midEarnings = hourlyRate * midShiftRate * midShiftHours;
  // Overtime earnings (no night differential applied on OT hours after 6 AM)
  const overtimeEarnings = hourlyRate * overtimeMultiplier * otHours;
  // De minimis allowance accrues evenly over the shift
  const allowanceEarnings = allowancePerSecond * secondsWorked;

  const total = baseEarnings + nightEarnings + midEarnings + overtimeEarnings + allowanceEarnings;
  return { baseEarnings, nightEarnings, midEarnings, overtimeEarnings, allowanceEarnings, total };
}

/**
 * Formats a numeric value into Philippine peso currency.
 *
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted value prefixed with the peso symbol
 */
function formatMoney(value) {
  return `₱${value.toFixed(2)}`;
}

/**
 * Updates the DOM elements with the latest time worked and earnings.
 * This function is called every second to reflect real‑time changes
 * in earnings. It computes the time since the start of the shift
 * using the Philippines timezone, calculates the earnings, and
 * updates the respective elements on the page.
 */
function updateDisplay() {
  const now = getPhilippinesTime();
  const shiftStart = getShiftStart(now);
  // Calculate total seconds worked so far
  const secondsWorked = Math.max((now.getTime() - shiftStart.getTime()) / 1000, 0);

  // Compute earnings breakdown
  const { baseEarnings, nightEarnings, midEarnings, overtimeEarnings, allowanceEarnings, total } = calculateEarnings(secondsWorked);

  // Convert seconds into hours, minutes, and seconds for display
  const totalSeconds = Math.floor(secondsWorked);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Update the DOM
  document.getElementById('time-worked').textContent = `${hours}h ${minutes}m ${seconds}s`;
  document.getElementById('base-earnings').textContent = formatMoney(baseEarnings);
  document.getElementById('night-earnings').textContent = formatMoney(nightEarnings);
  document.getElementById('mid-earnings').textContent = formatMoney(midEarnings);
  document.getElementById('ot-earnings').textContent = formatMoney(overtimeEarnings);
  document.getElementById('allowance-earnings').textContent = formatMoney(allowanceEarnings);
  document.getElementById('total-earnings').textContent = formatMoney(total);
}

// Initialize the display immediately and then update every second
updateDisplay();
setInterval(updateDisplay, 1000);