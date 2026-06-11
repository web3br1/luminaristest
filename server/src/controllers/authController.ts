import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { handleApiError } from '../lib/apiUtils';
import { generateToken } from '../lib/jwt';

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password, name } = req.body;
    
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { 
        OR: [{ username }, { email }] 
      },
    });
    
    if (existingUser) {
      res.status(400).json({
        success: false,
        error: existingUser.username === username ? 'Username already exists' : 'Email already exists',
      });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: { 
        username, 
        email, 
        password: hashedPassword, 
        name 
      },
      select: { 
        id: true, 
        username: true, 
        email: true, 
        name: true, 
        role: true, 
        createdAt: true 
      },
    });

    // Generate JWT
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.status(201).json({ 
      success: true, 
      data: { user, token } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    handleApiError(error, res);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, username, email, password } = req.body;

    // Debug: incoming payload keys (never log raw password)
    try {
      const payloadKeys = Object.keys(req.body || {}).filter((k) => k !== 'password');
      console.debug('[auth/login] incoming payload keys:', payloadKeys);
    } catch {}

    const loginIdentifier: string | undefined = identifier ?? username ?? email;
    if (!loginIdentifier || typeof password !== 'string') {
      res.status(400).json({
        success: false,
        error: 'identifier/username/email and password are required',
      });
      return;
    }

    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: loginIdentifier },
          { email: loginIdentifier },
        ],
      },
    });

    if (!user) {
      console.warn('[auth/login] user not found for identifier');
      res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
      return;
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.warn('[auth/login] invalid password for userId:', user.id);
      res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
      return;
    }

    // Generate JWT
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    console.info('[auth/login] success for userId:', user.id);
    res.json({
      success: true,
      data: {
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email, 
          name: user.name, 
          role: user.role 
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    handleApiError(error, res);
  }
};