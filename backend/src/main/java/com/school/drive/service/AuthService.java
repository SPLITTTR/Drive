package com.school.drive.service;

import com.school.drive.api.dto.MeResponse;
import com.school.drive.model.AppUser;
import com.school.drive.repo.AppUserRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class AuthService {

  @Inject JsonWebToken jwt;
  @Inject AppUserRepository users;

  @Transactional
  public AppUser upsertCurrentUser() {
    // Clerk puts the user id into "sub".
    String clerkUserId = jwt.getSubject();
    if (clerkUserId == null || clerkUserId.isBlank()) {
      throw new IllegalStateException("JWT missing sub claim (subject)");
    }

    AppUser existing = users.findByClerkUserId(clerkUserId);
    if (existing != null) return existing;

    AppUser u = new AppUser();
    u.id = UUID.randomUUID();
    u.clerkUserId = clerkUserId;
    u.createdAt = Instant.now();
    users.persist(u);
    return u;
  }

  @Transactional
  public MeResponse me() {
    AppUser u = upsertCurrentUser();
    MeResponse r = new MeResponse();
    r.userId = u.id;
    r.clerkUserId = u.clerkUserId;
    r.username = u.username;
    return r;
  }

  @Transactional
  public MeResponse setUsername(String username) {
    AppUser u = upsertCurrentUser();

    if (username == null) {
      throw new jakarta.ws.rs.BadRequestException("username required");
    }
    username = username.trim();
    if (username.isBlank()) {
      throw new jakarta.ws.rs.BadRequestException("username required");
    }

    username = username.toLowerCase();

    if (username.length() < 4 || username.length() > 64) {
      throw new jakarta.ws.rs.BadRequestException("username must be 4-64 characters");
    }
    if (!username.matches("[a-z0-9_]+")) {
      throw new jakarta.ws.rs.BadRequestException("username may contain only a-z, 0-9 and underscore");
    }

    AppUser other = users.findByUsername(username);
    if (other != null && !other.id.equals(u.id)) {
      throw new jakarta.ws.rs.WebApplicationException("username already taken", 409);
    }

    u.username = username;
    users.persist(u);

    MeResponse r = new MeResponse();
    r.userId = u.id;
    r.clerkUserId = u.clerkUserId;
    r.username = u.username;
    return r;
  }

}
