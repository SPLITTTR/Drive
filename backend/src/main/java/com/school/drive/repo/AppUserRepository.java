package com.school.drive.repo;

import com.school.drive.model.AppUser;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.UUID;

@ApplicationScoped
public class AppUserRepository implements PanacheRepositoryBase<AppUser, UUID> {
  public AppUser findByClerkUserId(String clerkUserId) {
    return find("clerkUserId", clerkUserId).firstResult();
  }
}
