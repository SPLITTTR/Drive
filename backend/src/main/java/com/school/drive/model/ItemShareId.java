package com.school.drive.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class ItemShareId implements Serializable {
  @Column(name = "item_id", nullable = false)
  public UUID itemId;

  @Column(name = "shared_with_user_id", nullable = false)
  public UUID sharedWithUserId;

  public ItemShareId() {}

  public ItemShareId(UUID itemId, UUID sharedWithUserId) {
    this.itemId = itemId;
    this.sharedWithUserId = sharedWithUserId;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof ItemShareId that)) return false;
    return Objects.equals(itemId, that.itemId) && Objects.equals(sharedWithUserId, that.sharedWithUserId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(itemId, sharedWithUserId);
  }
}
