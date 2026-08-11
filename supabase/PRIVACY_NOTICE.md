# MediFlow — Patient data-use notice (disclaimer text)

Show this at the AI chat entry point and on signup; record acceptance with
`record_consent('ai_data_use','v1',true)`. Keep the version in sync with the
`version` argument.

---

## What MediFlow does with your data (v1)

**Your privacy is protected by design.**

- When you use the MediFlow assistant, it receives **only your symptoms and
  clinical details** (medical history, medications, allergies) together with a
  **pseudonymous ID** (like `MF123456`).
- The assistant **never** receives your **name, age, gender, email, or civil ID**.
- Your identity details are stored **separately and encrypted**, and are visible
  only to authorised clinic staff — never to the assistant.
- The assistant helps organise your visit information; a **member of clinic staff
  reviews and approves** every appointment before it is confirmed.
- You can see exactly what the assistant receives about you at any time in
  "What the AI sees about me".

By continuing, you agree to this use of your data to provide the MediFlow service.

---

*Implementation notes:* enforced in the database — the assistant connects with a
restricted role that can only read `patient_id` + clinical fields
(`agent.patient_clinical`) and cannot reach the identity vault. See
SECURITY_HARDENING.md.
