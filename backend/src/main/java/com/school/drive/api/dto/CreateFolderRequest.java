package com.school.drive.api.dto;

import java.util.UUID;

public class CreateFolderRequest {
  public UUID parentId; // null = root
  public String name;
}
