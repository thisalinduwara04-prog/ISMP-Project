// Mirrors backend/src/config/constants.js ROLES. Kept in sync manually
// since frontend and backend are separate npm packages.
export const ROLES = {
  SALES: 'sales',
  WAREHOUSE: 'warehouse',
  ADMINISTRATION: 'administration',
  MANAGEMENT: 'management',
  ADMIN: 'admin',
};

export const ALL_ROLES = Object.values(ROLES);

export const ROLE_LABELS = {
  sales: 'Sales',
  warehouse: 'Warehouse',
  administration: 'Administration',
  management: 'Management',
  admin: 'IT Administrator',
};

export const COMPLIANCE_VIEWER_ROLES = [ROLES.ADMIN, ROLES.MANAGEMENT];

export const INCIDENT_TYPE_LABELS = {
  phishing_email: 'Phishing / suspicious email',
  lost_device: 'Lost or stolen device',
  suspicious_access: 'Suspicious access attempt',
  malware: 'Malware / malicious file',
  data_leak: 'Data leak / exposure',
  other: 'Other',
};

export const INCIDENT_STATUS_LABELS = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
};

export const SEVERITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
