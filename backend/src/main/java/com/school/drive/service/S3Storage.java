package com.school.drive.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;

import java.net.URI;

@ApplicationScoped
public class S3Storage {

  @ConfigProperty(name = "app.s3.endpoint")
  URI endpoint;

  @ConfigProperty(name = "app.s3.region")
  String region;

  @ConfigProperty(name = "app.s3.access-key")
  String accessKey;

  @ConfigProperty(name = "app.s3.secret-key")
  String secretKey;

  @ConfigProperty(name = "app.s3.bucket")
  String bucket;

  @Produces
  @Singleton
  public S3Client s3Client() {
    var creds = AwsBasicCredentials.create(accessKey, secretKey);
    var s3Config = S3Configuration.builder()
        .pathStyleAccessEnabled(true)
        .build();

    var client = S3Client.builder()
        .endpointOverride(endpoint)
        .region(Region.of(region))
        .credentialsProvider(StaticCredentialsProvider.create(creds))
        .serviceConfiguration(s3Config)
        .build();

    ensureBucket(client);
    return client;
  }

  private void ensureBucket(S3Client client) {
    try {
      client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
    } catch (NoSuchBucketException e) {
      client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
    } catch (Exception e) {
      System.err.println("S3 bucket check failed: " + e.getMessage());
    }
  }

  public String bucket() {
    return bucket;
  }
}
