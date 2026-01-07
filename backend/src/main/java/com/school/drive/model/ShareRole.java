package com.school.drive.model;

public enum ShareRole {
  VIEWER,
  EDITOR,
  OWNER;

  public boolean canWrite() {
    return this == EDITOR || this == OWNER;
  }
}
