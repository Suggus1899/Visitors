import { describe, it, expect } from "vitest";
import { checkInSchema } from "../../schemas/visit.schema";

const validPayload = {
  visitorCedula: "12345678",
  consent: {
    accepted: true,
    policyVersion: "1.0",
    acceptedAt: "2026-03-11T10:00:00.000Z",
  },
  purpose: "Reunión de negocios",
  personToVisit: "Recepcion",
  targetDepartment: "Administración",
  hostPerson: "Carlos Pérez",
};

describe("checkInSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = checkInSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a full payload with optional visitorData", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      notes: "Internal guest",
      visitorData: {
        firstName: "Juan",
        lastName: "Pérez",
        company: "Acme",
        email: "juan@acme.com",
        phone: "+584121234567",
        jobTitle: "Engineer",
      },
    });
    expect(result.success).toBe(true);
  });

  it("preserves idPhotoBase64 through schema validation", () => {
    const idPhoto = "data:image/jpeg;base64,/9j/fakedata==";
    const result = checkInSchema.safeParse({
      ...validPayload,
      visitorData: {
        firstName: "Juan",
        lastName: "Pérez",
        company: "Acme",
        photoBase64: "data:image/jpeg;base64,/9j/facedata==",
        idPhotoBase64: idPhoto,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visitorData?.idPhotoBase64).toBe(idPhoto);
    }
  });

  it("rejects missing visitorCedula", () => {
    const result = checkInSchema.safeParse({
      purpose: "Reunión",
      personToVisit: "Rec",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain("visitorCedula");
  });

  it("rejects missing purpose", () => {
    const result = checkInSchema.safeParse({
      visitorCedula: "12345678",
      consent: validPayload.consent,
      personToVisit: "Rec",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain("purpose");
  });

  it("rejects missing personToVisit", () => {
    const result = checkInSchema.safeParse({
      visitorCedula: "12345678",
      consent: validPayload.consent,
      purpose: "Reunión",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain("personToVisit");
  });

  it("rejects invalid email in visitorData", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      visitorData: { email: "not-an-email" },
    });
    expect(result.success).toBe(false);
    const emailIssue = result.error?.issues.find((i) =>
      i.path.includes("email"),
    );
    expect(emailIssue).toBeDefined();
  });

  it("rejects cedula longer than 20 chars", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      visitorCedula: "x".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional notes", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      notes: "VIP visitor",
    });
    expect(result.success).toBe(true);
  });

  it("accepts waiting status for queued visits", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      status: "waiting",
    });
    expect(result.success).toBe(true);
  });

  it("accepts active status for immediate admission", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported status values", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      status: "completed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts free-text area values", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      area: "Depósito norte",
    });
    expect(result.success).toBe(true);
  });

  it("rejects area longer than 200 chars", () => {
    const result = checkInSchema.safeParse({
      ...validPayload,
      area: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});
