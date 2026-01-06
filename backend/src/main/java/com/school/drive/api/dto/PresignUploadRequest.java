package com.school.drive.api.dto;

import java.util.UUID;

public class PresignUploadRequest {
  public UUID parentId;     // null = root
  public String filename;
  public String mimeType;
  public Long sizeBytes;
}
