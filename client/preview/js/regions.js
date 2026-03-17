// === Regional Price Multipliers ===
// Base prices are national average. Multipliers adjust for regional cost differences.
// Sources: Home Depot/Lowe's regional pricing, NAHB construction cost data, 2026 averages.
var REGIONS = {
  'national': { name: 'National Average', multiplier: 1.00 },
  'southeast': { name: 'Southeast (FL, GA, AL, SC, NC, TN, MS)', multiplier: 0.90 },
  'south-central': { name: 'South Central (TX, OK, AR, LA)', multiplier: 0.92 },
  'mid-atlantic': { name: 'Mid-Atlantic (VA, MD, DE, PA, NJ, DC)', multiplier: 1.08 },
  'northeast': { name: 'Northeast (NY, CT, MA, NH, VT, ME, RI)', multiplier: 1.22 },
  'midwest': { name: 'Midwest (OH, IN, IL, MI, WI, MN, IA, MO)', multiplier: 0.95 },
  'plains': { name: 'Plains (KS, NE, SD, ND, MT, WY)', multiplier: 0.93 },
  'mountain': { name: 'Mountain (CO, UT, AZ, NM, NV, ID)', multiplier: 1.05 },
  'pacific-nw': { name: 'Pacific NW (WA, OR)', multiplier: 1.12 },
  'california': { name: 'California', multiplier: 1.28 },
  'hawaii-alaska': { name: 'Hawaii / Alaska', multiplier: 1.45 }
};

// Apply regional multiplier to a base price
function applyRegion(basePrice, regionKey) {
  var region = REGIONS[regionKey];
  if (!region) return basePrice;
  return Math.round(basePrice * region.multiplier * 100) / 100;
}
