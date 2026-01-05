package com.school.drive.model;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "item")
public class Item extends PanacheEntityBase {
  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "owner_user_id", nullable = false)
  public UUID ownerUserId;

  @Column(name = "parent_id")
  public UUID parentId;

  @Enumerated(EnumType.STRING)
  @Column(name = "type", nullable = false)
  public ItemType type;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "mime_type")
  public String mimeType;

  @Column(name = "size_bytes")
  public Long sizeBytes;

  @Column(name = "s3_key")
  public String s3Key;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  public Instant updatedAt;
}
