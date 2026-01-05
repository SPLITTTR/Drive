package com.school.drive.model;

public enum ShareRole {
  VIEWER,
  EDITOR;

  public boolean canWrite() {
    return this == EDITOR;
  }
}
