package com.school.drive;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;

@Path("/health")
public class App {
  @GET
  public String ok() {
    return "ok";
  }
}
