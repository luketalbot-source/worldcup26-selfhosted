import { useState, useRef } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PhoneInput } from '@/components/PhoneInput';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { z } from 'zod';

type AuthStep = 'phone' | 'verify';

export const AdminLogin = () => {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const verifyInFlightRef = useRef(false);
  const { sendOtp, verifyOtp } = useAuth();

  const phoneSchema = z.string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone format. Use +1234567890');

  const handleSendOtp = async () => {
    setIsLoading(true);
    setError('');

    try {
      const phoneResult = phoneSchema.safeParse(phoneNumber);
      if (!phoneResult.success) {
        setError(phoneResult.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      // No tenant_id for admin login
      const { error: sendError } = await sendOtp(phoneNumber);
      
      if (sendError) {
        setError(sendError.message);
      } else {
        setStep('verify');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;
    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    
    setIsLoading(true);
    setError('');

    try {
      // No tenant_id for admin login, no username (existing user)
      const { error: verifyError } = await verifyOtp(phoneNumber, otpCode);
      
      if (verifyError) {
        setError(verifyError.message);
        setOtpCode('');
      }
      // On success, the auth state change will update the UI
    } catch (err) {
      setError('An unexpected error occurred');
      setOtpCode('');
    } finally {
      setIsLoading(false);
      verifyInFlightRef.current = false;
    }
  };

  const handleBack = () => {
    setError('');
    setStep('phone');
    setOtpCode('');
    verifyInFlightRef.current = false;
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError('');
    setOtpCode('');

    try {
      const { error: sendError } = await sendOtp(phoneNumber);
      if (sendError) {
        setError(sendError.message);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Admin Portal</CardTitle>
        <CardDescription>
          {step === 'phone' 
            ? 'Sign in with your phone number' 
            : 'Enter the verification code'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'phone' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Phone Number</label>
              <PhoneInput
                value={phoneNumber}
                onChange={setPhoneNumber}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              onClick={handleSendOtp}
              disabled={isLoading || !phoneNumber.trim()}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending code...
                </>
              ) : (
                'Send Verification Code'
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-2 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <div className="text-center mb-4">
              <p className="text-sm text-muted-foreground">Code sent to</p>
              <p className="font-medium text-foreground">{phoneNumber}</p>
            </div>

            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={(value) => setOtpCode(value)}
                onComplete={handleVerifyOtp}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              onClick={handleVerifyOtp}
              disabled={isLoading || otpCode.length !== 6}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Sign In'
              )}
            </Button>

            <div className="text-center">
              <button
                onClick={handleResendCode}
                disabled={isLoading}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Didn't receive a code? Resend
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
