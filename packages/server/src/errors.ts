export class KalloError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "KalloError";
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends KalloError {
  constructor(message = "Not Found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends KalloError {
  constructor(message = "Unauthorized") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends KalloError {
  constructor(message = "Forbidden") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends KalloError {
  constructor(message = "Bad Request") {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

export class ServerError extends KalloError {
  constructor(message = "Internal Server Error") {
    super(message, 500);
    this.name = "ServerError";
  }
}
