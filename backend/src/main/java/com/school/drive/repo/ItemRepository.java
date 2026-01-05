package com.school.drive.repo;

import com.school.drive.model.Item;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class ItemRepository implements PanacheRepositoryBase<Item, UUID> {

  public List<Item> listRootChildren(UUID ownerUserId) {
    return list("ownerUserId = ?1 and parentId is null order by type asc, name asc, createdAt asc", ownerUserId);
  }

  public List<Item> listChildren(UUID parentId) {
    return list("parentId = ?1 order by type asc, name asc, createdAt asc", parentId);
  }

  public List<Item> searchByName(String q, int limit) {
    return find("lower(name) like lower(?1) order by updatedAt desc", "%" + q + "%")
        .page(0, Math.max(1, limit))
        .list();
  }

  public boolean existsInSubtree(UUID rootId, UUID possibleDescendantId) {
    String sql =
        "WITH RECURSIVE tree AS ( " +
        "  SELECT id FROM item WHERE id = ?1 " +
        "  UNION ALL " +
        "  SELECT c.id FROM item c JOIN tree t ON c.parent_id = t.id " +
        ") " +
        "SELECT 1 FROM tree WHERE id = ?2 LIMIT 1";

    Object res = getEntityManager()
        .createNativeQuery(sql)
        .setParameter(1, rootId)
        .setParameter(2, possibleDescendantId)
        .getResultStream()
        .findFirst()
        .orElse(null);

    return res != null;
  }

  public List<String> listFileKeysInSubtree(UUID rootId) {
    String sql =
        "WITH RECURSIVE tree AS ( " +
        "  SELECT id, type, s3_key FROM item WHERE id = ?1 " +
        "  UNION ALL " +
        "  SELECT c.id, c.type, c.s3_key FROM item c JOIN tree t ON c.parent_id = t.id " +
        ") " +
        "SELECT s3_key FROM tree WHERE type = 'FILE' AND s3_key IS NOT NULL";

    @SuppressWarnings("unchecked")
    List<String> keys = getEntityManager()
        .createNativeQuery(sql)
        .setParameter(1, rootId)
        .getResultList();

    return keys;
  }
}
