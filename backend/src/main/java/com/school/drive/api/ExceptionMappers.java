package com.school.drive.api;

import com.school.drive.service.ItemService;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

public class ExceptionMappers {

  public static class ErrorBody {
    public String error;
    public ErrorBody(String error) { this.error = error; }
  }

  @Provider
  public static class NotFoundMapper implements ExceptionMapper<ItemService.NotFoundException> {
    @Override
    public Response toResponse(ItemService.NotFoundException e) {
      return Response.status(404).type(MediaType.APPLICATION_JSON).entity(new ErrorBody("not_found")).build();
    }
  }

  @Provider
  public static class ForbiddenMapper implements ExceptionMapper<ItemService.ForbiddenException> {
    @Override
    public Response toResponse(ItemService.ForbiddenException e) {
      return Response.status(403).type(MediaType.APPLICATION_JSON).entity(new ErrorBody(e.getMessage())).build();
    }
  }

  @Provider
  public static class BadRequestMapper implements ExceptionMapper<ItemService.BadRequestException> {
    @Override
    public Response toResponse(ItemService.BadRequestException e) {
      return Response.status(400).type(MediaType.APPLICATION_JSON).entity(new ErrorBody(e.getMessage())).build();
    }
  }
}
