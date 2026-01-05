package com.school.drive.api.dto;

import com.school.drive.model.ItemType;

import java.time.Instant;
import java.util.UUID;

public class ItemDto {
  public UUID id;
  public UUID parentId;
  public ItemType type;
  public String name;
  public String mimeType;
  public Long sizeBytes;
  public Instant createdAt;
  public Instant updatedAt;
}
