package com.school.drive.service;

import com.school.drive.api.dto.ItemDto;
import com.school.drive.model.AppUser;
import com.school.drive.model.Item;
import com.school.drive.model.ItemShare;
import com.school.drive.model.ItemShareId;
import com.school.drive.model.ItemType;
import com.school.drive.model.ShareRole;
import com.school.drive.repo.AppUserRepository;
import com.school.drive.repo.ItemRepository;
import com.school.drive.repo.ItemShareRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.persistence.EntityManager;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import com.school.drive.api.dto.PresignUploadResponse;
//import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;

import java.time.Duration;


import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@ApplicationScoped
public class ItemService {

  @Inject ItemRepository items;
  @Inject ItemShareRepository shares;
  @Inject AppUserRepository users;
  @Inject PermissionService perms;

  @Inject S3Storage storage;
  @Inject S3Client s3;

  @Inject EntityManager em;

  @Inject S3Presigner presigner;

  private static ItemDto toDto(Item it) {
    ItemDto d = new ItemDto();
    d.id = it.id;
    d.parentId = it.parentId;
    d.type = it.type;
    d.name = it.name;
    d.mimeType = it.mimeType;
    d.sizeBytes = it.sizeBytes;
    d.createdAt = it.createdAt;
    d.updatedAt = it.updatedAt;
    return d;
  }

  @Transactional
  public List<ItemDto> listRoot(UUID userId) {
    return items.listRootChildren(userId).stream().map(ItemService::toDto).collect(Collectors.toList());
  }

  @Transactional
  public List<ItemDto> listChildren(UUID userId, UUID folderId) {
    var access = perms.accessFor(userId, folderId);
    if (!access.canRead()) throw new ForbiddenException("No access");

    Item folder = items.findById(folderId);
    if (folder == null || folder.type != ItemType.FOLDER) throw new NotFoundException();

    return items.listChildren(folderId).stream()
        .filter(child -> perms.accessFor(userId, child.id).canRead())
        .map(ItemService::toDto)
        .collect(Collectors.toList());
  }

  @Transactional
  public ItemDto createFolder(UUID userId, UUID parentId, String name) {
    if (name == null || name.isBlank()) throw new BadRequestException("name required");

    if (parentId != null) {
      var access = perms.accessFor(userId, parentId);
      if (!access.canWrite()) throw new ForbiddenException("Need EDITOR to create in folder");
      Item parent = items.findById(parentId);
      if (parent == null || parent.type != ItemType.FOLDER) throw new BadRequestException("parentId must be a folder");
    }

    Item it = new Item();
    it.id = UUID.randomUUID();
    it.ownerUserId = userId;
    it.parentId = parentId;
    it.type = ItemType.FOLDER;
    it.name = name;
    it.createdAt = Instant.now();
    it.updatedAt = it.createdAt;

    items.persist(it);
    return toDto(it);
  }

  @Transactional
  public ItemDto patchItem(UUID userId, UUID itemId, String newName, UUID newParentId) {
    Item it = items.findById(itemId);
    if (it == null) throw new NotFoundException();

    var access = perms.accessFor(userId, itemId);
    if (!access.canWrite()) throw new ForbiddenException("Need EDITOR");

    if (newName != null && !newName.isBlank()) {
      it.name = newName;
      it.updatedAt = Instant.now();
    }

    if (newParentId != null) {
      var parentAccess = perms.accessFor(userId, newParentId);
      if (!parentAccess.canWrite()) throw new ForbiddenException("Need EDITOR on destination folder");

      Item parent = items.findById(newParentId);
      if (parent == null || parent.type != ItemType.FOLDER) throw new BadRequestException("parentId must be a folder");

      if (items.existsInSubtree(itemId, newParentId)) {
        throw new BadRequestException("Cannot move into its own subtree");
      }

      it.parentId = newParentId;
      it.updatedAt = Instant.now();
    }

    return toDto(it);
  }

  @Transactional
  public ItemDto uploadFile(UUID userId, UUID parentId, FileUpload fileUpload) {
    if (fileUpload == null) throw new BadRequestException("file required");
    String filename = fileUpload.fileName();

    if (parentId != null) {
      var access = perms.accessFor(userId, parentId);
      if (!access.canWrite()) throw new ForbiddenException("Need EDITOR to upload into folder");
      Item parent = items.findById(parentId);
      if (parent == null || parent.type != ItemType.FOLDER) throw new BadRequestException("parentId must be a folder");
    }

    Item it = new Item();
    it.id = UUID.randomUUID();
    it.ownerUserId = userId;
    it.parentId = parentId;
    it.type = ItemType.FILE;
    it.name = (filename == null || filename.isBlank()) ? "file" : filename;
    it.mimeType = fileUpload.contentType();
    it.sizeBytes = fileUpload.size();
    it.s3Key = "items/" + it.id;
    it.createdAt = Instant.now();
    it.updatedAt = it.createdAt;

    items.persist(it);

    PutObjectRequest put = PutObjectRequest.builder()
        .bucket(storage.bucket())
        .key(it.s3Key)
        .contentType(it.mimeType != null ? it.mimeType : "application/octet-stream")
        .build();

    s3.putObject(put, RequestBody.fromFile(fileUpload.uploadedFile().toFile()));
    return toDto(it);
  }

  @Transactional
  public PresignUploadResponse presignUpload(UUID userId, UUID parentId, String filename, String mimeType, Long sizeBytes) {
    if (filename == null || filename.isBlank()) throw new BadRequestException("filename required");

    if (parentId != null) {
      var access = perms.accessFor(userId, parentId);
      if (!access.canWrite()) throw new ForbiddenException("Need EDITOR to upload into folder");
      Item parent = items.findById(parentId);
      if (parent == null || parent.type != ItemType.FOLDER) throw new BadRequestException("parentId must be a folder");
    }

    Item it = new Item();
    it.id = UUID.randomUUID();
    it.ownerUserId = userId;
    it.parentId = parentId;
    it.type = ItemType.FILE;
    it.name = filename;
    it.mimeType = (mimeType == null || mimeType.isBlank()) ? "application/octet-stream" : mimeType;
    it.sizeBytes = sizeBytes;
    it.s3Key = "items/" + it.id;
    it.createdAt = Instant.now();
    it.updatedAt = it.createdAt;

    items.persist(it);

    PutObjectRequest put = PutObjectRequest.builder()
        .bucket(storage.bucket())
        .key(it.s3Key)
        .contentType(it.mimeType)
        .build();

    PutObjectPresignRequest presignReq = PutObjectPresignRequest.builder()
        .signatureDuration(Duration.ofMinutes(10))
        .putObjectRequest(put)
        .build();

    PresignedPutObjectRequest presigned = presigner.presignPutObject(presignReq);

    PresignUploadResponse out = new PresignUploadResponse();
    out.item = toDto(it);
    out.uploadUrl = presigned.url().toString();
    out.method = "PUT";
    out.contentType = it.mimeType;
    return out;
  }


  public DownloadedFile downloadFile(UUID userId, UUID fileId) {
    Item it = items.findById(fileId);
    if (it == null || it.type != ItemType.FILE) throw new NotFoundException();

    var access = perms.accessFor(userId, fileId);
    if (!access.canRead()) throw new ForbiddenException("No access");

    GetObjectRequest get = GetObjectRequest.builder()
        .bucket(storage.bucket())
        .key(it.s3Key)
        .build();

    ResponseInputStream<GetObjectResponse> stream = s3.getObject(get);
    String mime = it.mimeType != null ? it.mimeType : "application/octet-stream";
    String name = it.name != null ? it.name : "file";
    return new DownloadedFile(stream, mime, name);
  }

  @Transactional
  public void shareRoot(UUID ownerUserId, UUID itemId, String targetUsername, String targetClerkUserId, ShareRole role) {
    if ((targetUsername == null || targetUsername.isBlank()) && (targetClerkUserId == null || targetClerkUserId.isBlank())) {
      throw new BadRequestException("targetUsername or targetClerkUserId required");
    }
    if (role == null) role = ShareRole.VIEWER;

    // Resolve target user (preferred: username; fallback: clerk user id)
    AppUser target;
    if (targetUsername != null && !targetUsername.isBlank()) {
      String normalized = targetUsername.trim().toLowerCase();
      target = users.findByUsername(normalized);
      if (target == null) throw new NotFoundException("User not found");
    } else {
      String clerkId = targetClerkUserId.trim();
      target = users.findByClerkUserId(clerkId);
      if (target == null) {
        // Allow sharing to a Clerk user id that hasn't signed in yet (creates a placeholder user row).
        target = new AppUser();
        target.id = UUID.randomUUID();
        target.clerkUserId = clerkId;
        target.createdAt = Instant.now();
        users.persist(target);
      }
    }

        if (target.id.equals(ownerUserId)) throw new BadRequestException("You can not share to yourself");

    Item it = items.findById(itemId);
    if (it == null) throw new NotFoundException("Item not found");
    if (!it.ownerUserId.equals(ownerUserId)) throw new ForbiddenException("Only owner can share");

    // Upsert share
    ItemShare existing = shares.findById(new ItemShareId(itemId, target.id));
    if (existing == null) {
      ItemShare s = new ItemShare();
      s.id = new ItemShareId(itemId, target.id);
      s.role = role;
      s.createdAt = Instant.now();
      shares.persist(s);
    } else {
      existing.role = role;
    }
  }

  @Transactional
  public List<ItemDto> listSharedRoots(UUID userId) {
    List<ItemShare> myShares = shares.listSharesForUser(userId);

    List<ItemDto> roots = new ArrayList<>();
    for (ItemShare s : myShares) {
      Item it = items.findById(s.id.itemId);
      if (it == null) continue;
      roots.add(toDto(it));
    }
    return roots;
  }

@Transactional
public void deleteItem(UUID userId, UUID itemId) {
    Item it = items.findById(itemId);
  if (it == null) return;

  var access = perms.accessFor(userId, itemId);
  if (!access.canWrite()) throw new ForbiddenException("Need EDITOR to delete");

  // 1) Delete S3 objects first (best-effort) – keeps your existing logic
  List<String> keys = items.listFileKeysInSubtree(itemId);
  for (String k : keys) {
    try {
      s3.deleteObject(DeleteObjectRequest.builder().bucket(storage.bucket()).key(k).build());
    } catch (Exception ignored) {}
  }

  // 2) Delete DB rows bottom-up (children first, then parent)
  final String sql =
      "WITH RECURSIVE tree AS ( " +
      "  SELECT id, 0 AS depth " +
      "  FROM item " +
      "  WHERE id = ?1 " +
      "  UNION ALL " +
      "  SELECT c.id, t.depth + 1 " +
      "  FROM item c " +
      "  JOIN tree t ON c.parent_id = t.id " +
      ") " +
      "SELECT id FROM tree ORDER BY depth DESC";

  @SuppressWarnings("unchecked")
  List<Object> rows = em.createNativeQuery(sql)
      .setParameter(1, itemId)
      .getResultList();

  for (Object r : rows) {
    UUID id = (r instanceof UUID) ? (UUID) r : UUID.fromString(r.toString());
    items.deleteById(id);
  }
}


  @Transactional
  public List<ItemDto> searchByName(UUID userId, String q, int limit) {
    if (q == null || q.isBlank()) return List.of();
    int l = Math.min(Math.max(limit, 1), 50);

    List<Item> candidates = items.searchByName(q, l * 3);
    return candidates.stream()
        .filter(it -> perms.accessFor(userId, it.id).canRead())
        .limit(l)
        .map(ItemService::toDto)
        .collect(Collectors.toList());
  }

  public static class DownloadedFile {
    public final InputStream stream;
    public final String mimeType;
    public final String filename;

    public DownloadedFile(InputStream stream, String mimeType, String filename) {
      this.stream = stream;
      this.mimeType = mimeType;
      this.filename = filename;
    }
  }

  public static class NotFoundException extends RuntimeException {
    public NotFoundException() {}
    public NotFoundException(String message) { super(message); }
  }
public static class ForbiddenException extends RuntimeException {
    public ForbiddenException(String msg) { super(msg); }
  }
  public static class BadRequestException extends RuntimeException {
    public BadRequestException(String msg) { super(msg); }
  }
}
