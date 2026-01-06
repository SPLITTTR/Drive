package com.school.drive.api.dto;

public class PresignUploadResponse {
  public ItemDto item;
  public String uploadUrl;
  public String method;       // "PUT"
  public String contentType;  // npr. "image/png"
}
