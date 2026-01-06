package com.school.drive.api;

import com.school.drive.api.dto.*;
import com.school.drive.service.AuthService;
import com.school.drive.service.ItemService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import software.amazon.awssdk.awscore.presigner.PresignRequest;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.util.List;
import java.util.UUID;

@Path("/v1")
@Produces(MediaType.APPLICATION_JSON)
public class DriveResource {

  @Inject AuthService auth;
  @Inject ItemService items;

  @GET
  @Path("/me")
  public MeResponse me() {
    return auth.me();
  }

  @GET
  @Path("/root/children")
  public List<ItemDto> rootChildren() {
    UUID userId = auth.upsertCurrentUser().id;
    return items.listRoot(userId);
  }

  @GET
  @Path("/folders/{id}/children")
  public List<ItemDto> folderChildren(@PathParam("id") UUID folderId) {
    UUID userId = auth.upsertCurrentUser().id;
    return items.listChildren(userId, folderId);
  }

  @POST
  @Path("/folders")
  @Consumes(MediaType.APPLICATION_JSON)
  public ItemDto createFolder(CreateFolderRequest req) {
    UUID userId = auth.upsertCurrentUser().id;
    return items.createFolder(userId, req.parentId, req.name);
  }

  @PATCH
  @Path("/items/{id}")
  @Consumes(MediaType.APPLICATION_JSON)
  public ItemDto patchItem(@PathParam("id") UUID id, PatchItemRequest req) {
    UUID userId = auth.upsertCurrentUser().id;
    return items.patchItem(userId, id, req.name, req.parentId);
  }

  @POST
  @Path("/files/upload")
  @Consumes(MediaType.MULTIPART_FORM_DATA)
  public ItemDto uploadFile(@RestForm("parentId") String parentIdStr,
                            @RestForm("file") FileUpload file) {
    UUID userId = auth.upsertCurrentUser().id;
    UUID parentId = (parentIdStr == null || parentIdStr.isBlank()) ? null : UUID.fromString(parentIdStr);
    return items.uploadFile(userId, parentId, file);
  }

  @GET
  @Path("/files/{id}/download")
  @Produces(MediaType.APPLICATION_OCTET_STREAM)
  public Response download(@PathParam("id") UUID id) {
    UUID userId = auth.upsertCurrentUser().id;
    ItemService.DownloadedFile f = items.downloadFile(userId, id);

    String safeName = f.filename.replace("\"", "");
    return Response.ok(f.stream)
        .type(f.mimeType)
        .header("Content-Disposition", "attachment; filename=\"" + safeName + "\"")
        .build();
  }

  @POST
  @Path("/items/{id}/share")
  @Consumes(MediaType.APPLICATION_JSON)
  public Response share(@PathParam("id") UUID id, ShareRequest req) {
    UUID userId = auth.upsertCurrentUser().id;
    items.shareRoot(userId, id, req.targetClerkUserId, req.role);
    return Response.noContent().build();
  }

  @GET
  @Path("/shared")
  public List<ItemDto> sharedRoots() {
    UUID userId = auth.upsertCurrentUser().id;
    return items.listSharedRoots(userId);
  }

  @DELETE
  @Path("/items/{id}")
  public Response delete(@PathParam("id") UUID id) {
    UUID userId = auth.upsertCurrentUser().id;
    items.deleteItem(userId, id);
    return Response.noContent().build();
  }

  @GET
  @Path("/search")
  public List<ItemDto> search(@QueryParam("q") String q,
                              @QueryParam("limit") @DefaultValue("20") int limit) {
    UUID userId = auth.upsertCurrentUser().id;
    return items.searchByName(userId, q, limit);
  }

  @POST
  @Path("/files/presign-upload")
  @Consumes(MediaType.APPLICATION_JSON)
  public PresignUploadResponse presignUpload(PresignUploadRequest req) {
    UUID userId = auth.upsertCurrentUser().id;
    return items.presignUpload(userId, req.parentId, req.filename, req.mimeType, req.sizeBytes);
  }


}
