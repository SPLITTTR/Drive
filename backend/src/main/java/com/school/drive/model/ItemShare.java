package com.school.drive.model;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "item_share")
public class ItemShare extends PanacheEntityBase {
  @EmbeddedId
  public ItemShareId id;

  @Enumerated(EnumType.STRING)
  @Column(name = "role", nullable = false)
  public ShareRole role;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;
}
