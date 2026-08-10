/**
 * Indian state -> sales region mapping (North / South / East / West).
 * Used to compute profiles.region from the officer's state and by the
 * portal seeds. Keep in sync with the `region` check constraint in
 * db/portal-schema.sql.
 */
const STATE_REGION = {
  // North
  Delhi: "North",
  "Uttar Pradesh": "North",
  Punjab: "North",
  Haryana: "North",
  Chandigarh: "North",
  "Himachal Pradesh": "North",
  Uttarakhand: "North",
  "Jammu and Kashmir": "North",
  Ladakh: "North",
  // South
  Karnataka: "South",
  Telangana: "South",
  "Tamil Nadu": "South",
  Kerala: "South",
  "Andhra Pradesh": "South",
  Puducherry: "South",
  // East
  "West Bengal": "East",
  Bihar: "East",
  Assam: "East",
  Odisha: "East",
  Jharkhand: "East",
  Sikkim: "East",
  Meghalaya: "East",
  Tripura: "East",
  Manipur: "East",
  Mizoram: "East",
  Nagaland: "East",
  "Arunachal Pradesh": "East",
  // West (incl. central belt for a 4-region split)
  Maharashtra: "West",
  Gujarat: "West",
  Rajasthan: "West",
  Goa: "West",
  "Madhya Pradesh": "West",
  Chhattisgarh: "West",
};

function regionForState(state) {
  return STATE_REGION[state] || null;
}

module.exports = { STATE_REGION, regionForState };
