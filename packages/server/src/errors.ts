export class PomeloError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PomeloError";
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends PomeloError {
  constructor(message = "Not Found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends PomeloError {
  constructor(message = "Unauthorized") {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends PomeloError {
  constructor(message = "Forbidden") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends PomeloError {
  constructor(message = "Bad Request") {
    super(message, 400);
    this.name = "BadRequestError";
  }
}

export class ServerError extends PomeloError {
  constructor(message = "Internal Server Error") {
    super(message, 500);
    this.name = "ServerError";
  }
}
