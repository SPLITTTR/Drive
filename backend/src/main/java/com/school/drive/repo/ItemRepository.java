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

  public List<Item> searchOwned(UUID ownerUserId, String q, int limit) {
    return find("ownerUserId = ?1 and lower(name) like lower(?2) order by updatedAt desc",
        ownerUserId, "%" + q + "%")
        .page(0, Math.max(1, limit))
        .list();
  }

  public List<Item> searchInSubtree(UUID rootId, String q, int limit) {
    String sql =
        "WITH RECURSIVE tree AS ( " +
        "  SELECT id FROM item WHERE id = ?1 " +
        "  UNION ALL " +
        "  SELECT c.id FROM item c JOIN tree t ON c.parent_id = t.id " +
        ") " +
        "SELECT i.* FROM item i JOIN tree t ON i.id = t.id " +
        "WHERE lower(i.name) like lower(?2) " +
        "ORDER BY i.updated_at desc " +
        "LIMIT ?3";

    @SuppressWarnings("unchecked")
    List<Item> res = getEntityManager()
        .createNativeQuery(sql, Item.class)
        .setParameter(1, rootId)
        .setParameter(2, "%" + q + "%")
        .setParameter(3, Math.max(1, limit))
        .getResultList();
    return res;
  }

  public List<Item> searchSharedVisible(UUID userId, String q, int limit) {
    String sql =
        "WITH RECURSIVE visible AS ( " +
        "  SELECT s.item_id AS id FROM item_share s WHERE s.shared_with_user_id = ?1 " +
        "  UNION ALL " +
        "  SELECT c.id FROM item c JOIN visible v ON c.parent_id = v.id " +
        ") " +
        "SELECT i.* FROM item i JOIN visible v ON i.id = v.id " +
        "WHERE lower(i.name) like lower(?2) " +
        "ORDER BY i.updated_at desc " +
        "LIMIT ?3";

    @SuppressWarnings("unchecked")
    List<Item> res = getEntityManager()
        .createNativeQuery(sql, Item.class)
        .setParameter(1, userId)
        .setParameter(2, "%" + q + "%")
        .setParameter(3, Math.max(1, limit))
        .getResultList();
    return res;
  }


  public boolean existsInSubtree(UUID rootId, UUID possibleDescendantId) {
    String sql =
        "WITH RECURSIVE tree AS ( " +
        "  SELECT id FROM item WHERE id = ?1 " +
        "  UNION ALL " +
        "  SELECT c.id FROM item c JOIN tree t ON c.parent_id = t.id " +
        ") " +
        "SELECT 1 FROM tree WHERE id = ?2 LIMIT 1";

    var q = getEntityManager()
      .createNativeQuery(sql)
      .setParameter(1, rootId)
      .setParameter(2, possibleDescendantId);
    var list = q.getResultList();
    Object res = list.isEmpty() ? null : list.get(0);

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
