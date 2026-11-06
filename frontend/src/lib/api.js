export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request(path, options) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Unable to reach the salary service. Check your connection and try again.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error || "The salary service could not complete this request. Please try again.", response.status);
  }
  return response.json();
}
