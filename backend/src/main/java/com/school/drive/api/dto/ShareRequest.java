package com.school.drive.api.dto;

import com.school.drive.model.ShareRole;

public class ShareRequest {
  public String targetUsername;
  public String targetClerkUserId;
  public ShareRole role;
}
