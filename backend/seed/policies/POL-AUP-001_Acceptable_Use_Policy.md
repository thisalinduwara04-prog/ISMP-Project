---
code: POL-AUP-001
title: Acceptable Use Policy
category: GENERAL
versionNumber: 1
targetRoles: []          # all roles
targetDepartments: []    # all departments
dueInDays: 14
description: The standards every employee must follow when using the Security Policy Awareness & Compliance Management Platform.
---

# Acceptable Use Policy

**Policy code:** POL-AUP-001 · **Version:** 1.0 · **Applies to:** All Platform users
**Effective date:** 29 September 2026 · **Approved by:** Savikro Enterprises Management

## 1. Introduction

This Acceptable Use Policy (AUP) sets the standards and expectations for using the Security Policy Awareness & Compliance Management Platform of Savikro Enterprises. The Platform is a web application that gives employees one place to read the company's information security policies, complete security awareness training and quizzes, acknowledge policy updates and report security incidents, and gives management a dashboard to track compliance.

The aim of this policy is to ensure that the Platform is used securely, ethically and responsibly, while protecting the personal data of Savikro Enterprises' employees and the information held in the Platform.

## 2. Applicability

This AUP applies to every person who is given access to the Platform, including but not limited to:

- registered employees of Savikro Enterprises in the Sales, Warehouse, Administration and Management functions;
- System Administrators who manage policies, training, users and reports.

It covers all modules of the Platform — User Authentication & Authorisation, Policy Management, Security Training & Awareness, Compliance Tracking & Reporting, and Incident Reporting — all information displayed in or exported from it, and every device used to access it, whether company-owned office desktops, shared warehouse tablets or personally owned mobile phones and laptops. By using the Platform, each user agrees to comply with this policy.

## 3. User Roles and Access

Access to the Platform is controlled by role-based access control (RBAC). Each user is assigned one role when their account is created and can only use the modules and data relevant to that role. Role checks are enforced on the server API layer, not only in the user interface.

| Role | Permitted use of the Platform |
|------|-------------------------------|
| **Employee** | Log in and change their own password; view the policies assigned to their role and department; acknowledge each policy version they have read; view their own compliance status; complete assigned training modules and attempt the quizzes; submit incident reports and view the status of the incidents they submitted. |
| **Manager** | All Employee functions, plus: view the compliance dashboard for their own department; send manual reminders to staff in their department; export compliance reports (PDF/Excel) for their department only; view phishing simulation results for their department as totals only, never for named individuals. |
| **Administrator** | All Manager functions across the whole organisation, plus: view the organisation-wide compliance dashboard; send reminders to any user and export compliance reports for all departments; create, edit and publish policies and policy versions; create and edit training modules and quizzes; view, triage, assign and resolve all incidents; create, deactivate and change the role of user accounts; view the system audit log; create phishing simulation templates, launch simulations and view all simulation results. |

## 4. Acceptable Use of the Application

Users are expected to use each part of the Platform as follows:

- **Accounts:** Use only the account created for you, in your own name, employee ID, department and role. Each account is for one person only and must never be shared.
- **Policy acknowledgement:** Read each new or updated policy in full before acknowledging it. An acknowledgement is recorded with the policy version and a timestamp.
- **Training and quizzes:** Complete each training module assigned to your role within 14 days and attempt the quiz yourself, without help from others. Quizzes can be retaken; results are used to improve awareness, not to punish.
- **Incident reporting:** Report suspicious emails such as phishing, lost or stolen devices, suspicious files or links, and unauthorised access attempts through the in-app Incident Report form as soon as possible and within 24 hours. Reports made in good faith will never lead to disciplinary action.
- **Compliance dashboard and reports:** Administrators may use the dashboard and exported reports only to monitor policy acknowledgement, training completion and incidents, and must store exported reports only in approved company locations.
- **Business use only:** The Platform must be used only for Savikro Enterprises' security awareness and compliance purposes.

## 5. Prohibited Activities

Users must not use the Platform in any way that is harmful, illegal, or that infringes on the rights of other individuals or of Savikro Enterprises. The following uses are prohibited.

### 5.1 Illegal Activities

- Using the Platform for any activity that breaks Sri Lankan law, including the Computer Crimes Act and the Personal Data Protection Act, or any international law.
- Uploading or distributing pirated software, illegal material or any content unrelated to company business.

### 5.2 Unlawful and Inappropriate Content

- Posting, uploading or attaching content that is defamatory, obscene, offensive or harmful.
- Uploading content that violates the intellectual property rights of others, such as copyright, trademarks and trade secrets.

### 5.3 Security Violations

- Attempting to access modules, records or reports outside your assigned role, or trying to change your own role or permissions.
- Trying to bypass login, account lockout, session timeout, re-authentication or input validation, or probing, scanning or testing the Platform without written approval from management.
- Uploading viruses, malware or any other harmful code, or doing anything that affects the availability of the Platform.

### 5.4 Misrepresentation

- Giving false details for your account, using another person's credentials, or impersonating another employee or entity.
- Completing training or quizzes on another person's behalf, or acknowledging a policy for someone else.
- Knowingly submitting false or malicious incident reports.

### 5.5 Misuse of Employee Data

- Altering or deleting policies, acknowledgement records, quiz results or audit logs without authorisation.
- Using employees' compliance records or quiz scores for any purpose other than security compliance.

### 5.6 Harassment and Abuse

- Using incident reports or any other feature to harass, threaten, bully or falsely accuse other users.
- Posting content that discriminates against anyone on the basis of race, gender, religion, nationality or any other personal characteristic.

## 6. User Responsibilities and Security Best Practices

All users are responsible for:

- **Protecting login details:** Use a strong, unique password that meets all five Platform requirements — at least **8 characters**, with an **uppercase** letter, a **lowercase** letter, a **number** and a **special character** — and never share it with anyone, including Administrators.
- **Securing sessions and devices:** Always log out after use, especially on shared warehouse tablets, and never leave a logged-in device unattended.
- **Using secure connections:** Access the Platform only through its official HTTPS address, and avoid public Wi-Fi when handling sensitive functions.
- **Recognising phishing:** Verify any message asking for payments, price lists, login details or bank changes by phone before acting on it.
- **Reporting problems:** Report any suspicious activity, unexpected lockout or security breach to the Administrator immediately through the Incident Reporting module.
- **Keeping information accurate:** Keep profile details correct, and inform your Manager when an employee leaves or changes role so the account can be updated the same day.

## 7. Employee Data Privacy

The Platform collects only the data needed to run the security awareness programme: name, employee ID, department and role; hashed passwords and login records; policy acknowledgements; training completion and quiz scores; and incident reports. This data is handled in line with the Personal Data Protection Act.

Passwords are stored as bcrypt hashes, all traffic is encrypted with HTTPS/TLS, and compliance data is visible only to the employee concerned and to authorised management. Employees can view their own records at any time and request correction of inaccurate details. The Platform does not track employees' location or any activity outside the Platform.

## 8. Enforcement

The Platform keeps audit logs of logins, policy acknowledgements, training results and incident activity to monitor compliance with this AUP. Administrators, acting under the authority of Savikro Enterprises management, have the right to:

- monitor user activity on the Platform to ensure compliance with this policy;
- suspend, restrict or deactivate the account of any user found violating this policy;
- escalate serious violations to top management for disciplinary or legal action where necessary.

Minor violations, such as late acknowledgements, lead to a reminder and retraining. Serious violations, such as account sharing, unauthorised access or data leakage, may lead to account deactivation and disciplinary action. Every suspected violation is investigated using the audit logs, and the user is given a chance to explain before any action is taken.

## 9. Report Violations

Users must report any violation of this policy through the Platform's Incident Reporting module, or directly to the System Administrator or Savikro Enterprises management. Reports should include a description of the violation, the date and time, any available evidence such as a screenshot, and the reporter's account details. High-severity reports, such as a lost device or a compromised account, are sent to the System Administrator immediately. All reports are handled confidentially.

## 10. Amendments

This AUP will be reviewed at least once a year and may be updated when security needs, legal requirements, organisational demands or the Platform's features change. Updated versions are published through the Policy Management module, users are notified, and each user must acknowledge the new version. Continued use of the Platform means acceptance of the updated terms.

## Acknowledgement

By selecting **"I have read and understood this policy"**, I confirm that I have read this Acceptable Use Policy, understand it, and agree to follow it.
