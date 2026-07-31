import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongodb";

export interface UserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

async function usersCollection(): Promise<Collection<UserDocument>> {
  const db = await getDb();
  const collection = db.collection<UserDocument>("users");
  await collection.createIndex({ email: 1 }, { unique: true });
  return collection;
}

function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

export async function findUserByEmail(
  email: string,
): Promise<UserDocument | null> {
  const collection = await usersCollection();
  return collection.findOne({ email: email.toLowerCase().trim() });
}

export async function findUserById(id: string): Promise<UserDocument | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const collection = await usersCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<PublicUser> {
  const collection = await usersCollection();
  const now = new Date();

  const result = await collection.insertOne({
    _id: new ObjectId(),
    name: input.name.trim(),
    email: input.email.toLowerCase().trim(),
    passwordHash: input.passwordHash,
    createdAt: now,
  });

  return {
    id: result.insertedId.toString(),
    name: input.name.trim(),
    email: input.email.toLowerCase().trim(),
  };
}

export { toPublicUser };
