package com.school.drive.model;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class AppUser extends PanacheEntityBase {
  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "clerk_user_id", nullable = false, unique = true)
  public String clerkUserId;

  @Column(name = "username", unique = true)
  public String username;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;
}
