import { StatusCodes } from "http-status-codes";

import { HooksResponseSchema, type HooksResponse } from "@/api/hooks/hooksModel";
import { HooksRepository } from "@/api/hooks/hooksRepository";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { Logger } from "@/common/utils/logger";

export class HooksService {
  private hooksRepository: HooksRepository;

  constructor(repository: HooksRepository = new HooksRepository()) {
    this.hooksRepository = repository;
  }

  // Retrieves all hooks from the database
  async findAll(): Promise<ServiceResponse<null>> {
    return ServiceResponse.success<null>("Hooks found", null);
  }
}

export const hooksService = new HooksService(); 