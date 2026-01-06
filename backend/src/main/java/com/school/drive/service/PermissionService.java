package com.school.drive.service;

import com.school.drive.model.ShareRole;
import com.school.drive.repo.ItemRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

@ApplicationScoped
public class PermissionService {

  @Inject ItemRepository items;

  public enum Access {
    NONE,
    VIEWER,
    EDITOR;

    public boolean canRead() { return this != NONE; }
    public boolean canWrite() { return this == EDITOR; }
  }

  /**
   * Shared-roots model:
   * - You always have EDITOR on items you own.
   * - You have VIEWER/EDITOR on an item if any ancestor (including itself) is shared with you.
   */
  public Access accessFor(UUID userId, UUID itemId) {
    var item = items.findById(itemId);
    if (item == null) return Access.NONE;

    if (item.ownerUserId.equals(userId)) return Access.EDITOR;

    String sql =
        "WITH RECURSIVE ancestors AS ( " +
        "  SELECT id, parent_id FROM item WHERE id = ?1 " +
        "  UNION ALL " +
        "  SELECT p.id, p.parent_id " +
        "  FROM item p " +
        "  JOIN ancestors a ON a.parent_id = p.id " +
        ") " +
        "SELECT s.role " +
        "FROM item_share s " +
        "JOIN ancestors a ON a.id = s.item_id " +
        "WHERE s.shared_with_user_id = ?2 " +
        "ORDER BY CASE s.role WHEN 'EDITOR' THEN 2 WHEN 'VIEWER' THEN 1 ELSE 0 END DESC " +
        "LIMIT 1";

    var q = items.getEntityManager()
      .createNativeQuery(sql)
      .setParameter(1, itemId)
      .setParameter(2, userId)
      .setMaxResults(1);

    var list = q.getResultList();
    Object role = list.isEmpty() ? null : list.get(0);

    if (role == null) return Access.NONE;
    ShareRole r = ShareRole.valueOf(role.toString());
    return (r == ShareRole.EDITOR) ? Access.EDITOR : Access.VIEWER;
  }
}
